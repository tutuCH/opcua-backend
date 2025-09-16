import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface MessageJob {
  id: string;
  data: any;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processAfter?: string;
}

@Injectable()
export class ReliableQueueService {
  private readonly logger = new Logger(ReliableQueueService.name);

  constructor(private readonly redis: RedisService) {}

  // Producer: Add job to queue with reliability features
  async addJob(
    queueName: string,
    data: any,
    options?: {
      maxAttempts?: number;
      delay?: number;
      priority?: number;
    },
  ): Promise<string> {
    const job: MessageJob = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data,
      attempts: 0,
      maxAttempts: options?.maxAttempts || 3,
      createdAt: new Date().toISOString(),
      processAfter: options?.delay
        ? new Date(Date.now() + options.delay).toISOString()
        : undefined,
    };

    const priority = options?.priority || 0;
    const queueKey = `queue:${queueName}`;

    // Add to priority queue (higher score = higher priority)
    await this.redis.zadd(queueKey, priority, JSON.stringify(job));

    this.logger.debug(`Job ${job.id} added to queue ${queueName}`);
    return job.id;
  }

  // Consumer: Get next job for processing (with acknowledgment pattern)
  async getNextJob(
    queueName: string,
    workerId: string,
  ): Promise<MessageJob | null> {
    const queueKey = `queue:${queueName}`;
    const processingKey = `processing:${queueName}`;

    // Get highest priority job
    const result = await this.redis.zpopmax(queueKey, 1);
    if (!result || result.length === 0) {
      return null;
    }

    const job: MessageJob = JSON.parse(result[0]);

    // Check if job should be delayed
    if (job.processAfter && new Date(job.processAfter) > new Date()) {
      // Re-add to queue with delay
      await this.redis.zadd(queueKey, 0, JSON.stringify(job));
      return null;
    }

    // Move to processing set with expiration
    const processingData = {
      ...job,
      workerId,
      startedAt: new Date().toISOString(),
    };
    await this.redis.setex(
      `${processingKey}:${job.id}`,
      300, // 5 minutes timeout
      JSON.stringify(processingData),
    );

    return job;
  }

  // Consumer: Acknowledge job completion
  async ackJob(queueName: string, jobId: string): Promise<void> {
    const processingKey = `processing:${queueName}:${jobId}`;
    await this.redis.del(processingKey);
    this.logger.debug(`Job ${jobId} acknowledged`);
  }

  // Consumer: Handle job failure
  async failJob(
    queueName: string,
    job: MessageJob,
    error: string,
  ): Promise<void> {
    const processingKey = `processing:${queueName}:${job.id}`;
    await this.redis.del(processingKey);

    job.attempts++;

    if (job.attempts >= job.maxAttempts) {
      // Move to dead letter queue
      const deadLetterKey = `dead:${queueName}`;
      await this.redis.lpush(
        deadLetterKey,
        JSON.stringify({
          ...job,
          failedAt: new Date().toISOString(),
          lastError: error,
        }),
      );
      this.logger.error(
        `Job ${job.id} moved to dead letter queue after ${job.attempts} attempts`,
      );
    } else {
      // Retry with exponential backoff
      const delay = Math.pow(2, job.attempts) * 1000; // 2^attempts seconds
      job.processAfter = new Date(Date.now() + delay).toISOString();

      const queueKey = `queue:${queueName}`;
      await this.redis.zadd(queueKey, 0, JSON.stringify(job));
      this.logger.warn(
        `Job ${job.id} scheduled for retry ${job.attempts}/${job.maxAttempts} in ${delay}ms`,
      );
    }
  }

  // Monitor: Get queue statistics
  async getQueueStats(queueName: string) {
    const queueKey = `queue:${queueName}`;
    const processingKey = `processing:${queueName}`;
    const deadLetterKey = `dead:${queueName}`;

    const [pending, processing, failed] = await Promise.all([
      this.redis.zcard(queueKey),
      this.redis.keys(`${processingKey}:*`).then((keys) => keys.length),
      this.redis.llen(deadLetterKey),
    ]);

    return { pending, processing, failed };
  }

  // Worker Pool: Process jobs with multiple workers
  async startWorker(
    queueName: string,
    processor: (job: MessageJob) => Promise<void>,
    options?: { concurrency?: number; workerId?: string },
  ): Promise<() => void> {
    const workerId = options?.workerId || `worker-${Date.now()}`;
    const concurrency = options?.concurrency || 1;

    let isRunning = true;
    const workers: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i++) {
      workers.push(
        this.workerLoop(
          queueName,
          `${workerId}-${i}`,
          processor,
          () => isRunning,
        ),
      );
    }

    this.logger.log(`Started ${concurrency} workers for queue ${queueName}`);

    // Return stop function
    return () => {
      isRunning = false;
      Promise.all(workers).then(() => {
        this.logger.log(`Stopped workers for queue ${queueName}`);
      });
    };
  }

  private async workerLoop(
    queueName: string,
    workerId: string,
    processor: (job: MessageJob) => Promise<void>,
    shouldContinue: () => boolean,
  ): Promise<void> {
    while (shouldContinue()) {
      try {
        const job = await this.getNextJob(queueName, workerId);

        if (!job) {
          // No jobs available, wait before polling again
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        try {
          await processor(job);
          await this.ackJob(queueName, job.id);
          this.logger.debug(`Worker ${workerId} completed job ${job.id}`);
        } catch (error) {
          await this.failJob(queueName, job, error.message);
          this.logger.error(`Worker ${workerId} failed job ${job.id}:`, error);
        }
      } catch (error) {
        this.logger.error(`Worker ${workerId} loop error:`, error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  // Cleanup: Handle stuck jobs (run periodically)
  async cleanupStuckJobs(queueName: string): Promise<void> {
    const processingKey = `processing:${queueName}`;
    const keys = await this.redis.keys(`${processingKey}:*`);

    for (const key of keys) {
      const data = await this.redis.getRaw(key);
      if (!data) continue;

      const job = JSON.parse(data);
      const startedAt = new Date(job.startedAt);
      const now = new Date();

      // If job has been processing for more than 10 minutes, consider it stuck
      if (now.getTime() - startedAt.getTime() > 600000) {
        await this.redis.del(key);
        await this.failJob(
          queueName,
          job,
          'Job timeout - worker may have crashed',
        );
        this.logger.warn(`Cleaned up stuck job ${job.id}`);
      }
    }
  }
}

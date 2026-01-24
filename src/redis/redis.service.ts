import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private redis: Redis | null;
  private subscriber: Redis | null;
  private publisher: Redis | null;

  async onModuleInit() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || 'password',
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    // Initialize main Redis connection
    try {
      this.redis = new Redis(redisConfig);
      await this.redis.connect();
      this.logger.log(
        `✅ Main Redis connection established to ${redisConfig.host}:${redisConfig.port}`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to connect main Redis connection:', error);
      this.redis = null;
    }

    // Initialize subscriber connection separately
    try {
      this.subscriber = new Redis(redisConfig);
      await this.subscriber.connect();
      this.logger.log(`✅ Redis subscriber connection established`);
    } catch (error) {
      this.logger.error('❌ Failed to connect Redis subscriber:', error);
      this.subscriber = null;
    }

    // Initialize publisher connection separately
    try {
      this.publisher = new Redis(redisConfig);
      await this.publisher.connect();
      this.logger.log(`✅ Redis publisher connection established`);
    } catch (error) {
      this.logger.error('❌ Failed to connect Redis publisher:', error);
      this.publisher = null;
    }

    // Overall status
    if (this.redis && this.subscriber && this.publisher) {
      this.logger.log(`🔗 All Redis connections established successfully`);
    } else {
      this.logger.warn(
        `⚠️ Partial Redis connectivity - Main: ${!!this.redis}, Subscriber: ${!!this.subscriber}, Publisher: ${!!this.publisher}`,
      );
    }
  }

  // Cache operations
  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - cache operation skipped');
      return;
    }

    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.redis.setex(key, ttl, serializedValue);
      } else {
        await this.redis.set(key, serializedValue);
      }
      this.logger.debug(`Cache set: ${key} (ttl: ${ttl || 'none'})`);
    } catch (error) {
      this.logger.error(`Failed to set cache key: ${key}`, error);
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - returning null');
      return null;
    }

    try {
      const value = await this.redis.get(key);
      if (!value) {
        this.logger.debug(`Cache miss: ${key}`);
        return null;
      }
      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(value);
    } catch (error) {
      this.logger.error(`Failed to get cache key: ${key}`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Failed to delete cache key: ${key}`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check existence of key: ${key}`, error);
      throw error;
    }
  }

  // Machine status cache operations
  async setMachineStatus(
    deviceId: string,
    data: any,
    ttl: number = 30,
  ): Promise<void> {
    const key = `machine:${deviceId}:status`;
    await this.set(key, data, ttl);
  }

  async getMachineStatus(deviceId: string): Promise<any | null> {
    const key = `machine:${deviceId}:status`;
    return this.get(key);
  }

  // Message queue operations
  async enqueueMessage(queue: string, message: any): Promise<void> {
    try {
      const serializedMessage = JSON.stringify({
        ...message,
        enqueuedAt: new Date().toISOString(),
      });
      await this.redis.lpush(queue, serializedMessage);
      this.logger.debug(`Message enqueued to ${queue}`);
    } catch (error) {
      this.logger.error(`Failed to enqueue message to ${queue}`, error);
      throw error;
    }
  }

  async dequeueMessage(
    queue: string,
    timeout: number = 5,
  ): Promise<any | null> {
    try {
      const result = await this.redis.brpop(queue, timeout);
      if (result) {
        const [, message] = result;
        return JSON.parse(message);
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to dequeue message from ${queue}`, error);
      throw error;
    }
  }

  async getQueueLength(queue: string): Promise<number> {
    try {
      return await this.redis.llen(queue);
    } catch (error) {
      this.logger.error(`Failed to get queue length for ${queue}`, error);
      throw error;
    }
  }

  // Pub/Sub operations
  async publish(channel: string, message: any): Promise<void> {
    if (!this.publisher) {
      this.logger.warn(
        `Cannot publish to channel ${channel} - Redis publisher not initialized`,
      );
      return;
    }

    try {
      const serializedMessage = JSON.stringify({
        ...message,
        publishedAt: new Date().toISOString(),
      });
      await this.publisher.publish(channel, serializedMessage);
      this.logger.debug(`Message published to channel ${channel}`);
    } catch (error) {
      this.logger.error(`Failed to publish to channel ${channel}`, error);
      // Don't throw error to prevent application failure
    }
  }

  async subscribe(
    channel: string,
    callback: (message: any) => void,
  ): Promise<void> {
    try {
      if (!this.subscriber) {
        this.logger.error(
          `❌ Cannot subscribe to channel ${channel} - Redis subscriber not initialized. Check Redis connectivity.`,
        );
        // Try to reinitialize subscriber
        await this.reinitializeSubscriber();
        if (!this.subscriber) {
          this.logger.error(
            `❌ Failed to reinitialize Redis subscriber for channel ${channel}`,
          );
          return;
        }
      }

      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch (parseError) {
            this.logger.error(
              `Failed to parse message from channel ${channel}`,
              parseError,
            );
          }
        }
      });
      this.logger.log(`✅ Subscribed to Redis channel: ${channel}`);
    } catch (error) {
      this.logger.error(`❌ Failed to subscribe to channel ${channel}:`, error);
      // Don't throw error to prevent application startup failure
    }
  }

  private async reinitializeSubscriber(): Promise<void> {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || 'password',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      };

      this.logger.log('🔄 Attempting to reinitialize Redis subscriber...');
      this.subscriber = new Redis(redisConfig);
      await this.subscriber.connect();
      this.logger.log('✅ Redis subscriber reinitialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to reinitialize Redis subscriber:', error);
      this.subscriber = null;
    }
  }

  async unsubscribe(channel?: string): Promise<void> {
    try {
      if (channel) {
        await this.subscriber.unsubscribe(channel);
        this.logger.log(`Unsubscribed from channel ${channel}`);
      } else {
        await this.subscriber.unsubscribe();
        this.logger.log('Unsubscribed from all channels');
      }
    } catch (error) {
      this.logger.error(
        `Failed to unsubscribe from channel ${channel || 'all'}`,
        error,
      );
      throw error;
    }
  }

  // Queue-specific operations for MQTT message processing
  async enqueueMQTTMessage(topic: string, payload: any): Promise<void> {
    const queue = this.getQueueNameForTopic(topic);
    await this.enqueueMessage(queue, {
      topic,
      payload,
      receivedAt: new Date().toISOString(),
    });
  }

  async dequeueMQTTMessage(topic: string): Promise<any | null> {
    const queue = this.getQueueNameForTopic(topic);
    return this.dequeueMessage(queue);
  }

  private getQueueNameForTopic(topic: string): string {
    // Extract topic type from MQTT topic (realtime, spc, tech)
    const topicParts = topic.split('/');
    const topicType = topicParts[topicParts.length - 1];
    return `mqtt:${topicType}`;
  }

  // Advanced queue operations for reliable messaging
  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - zadd operation skipped');
      return 0;
    }
    try {
      return await this.redis.zadd(key, score, member);
    } catch (error) {
      this.logger.error(`Failed to zadd to key: ${key}`, error);
      throw error;
    }
  }

  async zpopmax(key: string, count: number = 1): Promise<string[]> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - zpopmax operation skipped');
      return [];
    }
    try {
      return await this.redis.zpopmax(key, count);
    } catch (error) {
      this.logger.error(`Failed to zpopmax from key: ${key}`, error);
      throw error;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - setex operation skipped');
      return;
    }
    try {
      await this.redis.setex(key, seconds, value);
    } catch (error) {
      this.logger.error(`Failed to setex key: ${key}`, error);
      throw error;
    }
  }

  async zcard(key: string): Promise<number> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - zcard operation skipped');
      return 0;
    }
    try {
      return await this.redis.zcard(key);
    } catch (error) {
      this.logger.error(`Failed to zcard key: ${key}`, error);
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - keys operation skipped');
      return [];
    }
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      this.logger.error(`Failed to get keys with pattern: ${pattern}`, error);
      throw error;
    }
  }

  async llen(key: string): Promise<number> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - llen operation skipped');
      return 0;
    }
    try {
      return await this.redis.llen(key);
    } catch (error) {
      this.logger.error(`Failed to llen key: ${key}`, error);
      throw error;
    }
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - lpush operation skipped');
      return 0;
    }
    try {
      return await this.redis.lpush(key, ...values);
    } catch (error) {
      this.logger.error(`Failed to lpush to key: ${key}`, error);
      throw error;
    }
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - ltrim operation skipped');
      return;
    }
    try {
      await this.redis.ltrim(key, start, stop);
    } catch (error) {
      this.logger.error(`Failed to ltrim key: ${key}`, error);
      throw error;
    }
  }

  async getRaw(key: string): Promise<string | null> {
    if (!this.redis) {
      this.logger.warn('Redis not connected - returning null');
      return null;
    }
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Failed to get raw key: ${key}`, error);
      throw error;
    }
  }

  // Clean up old messages from queues that exceed retention policy (1 hour)
  async cleanupOldMessages(): Promise<void> {
    try {
      if (!this.redis) {
        this.logger.warn('Redis not connected - cleanup skipped');
        return;
      }

      const queueKeys = ['mqtt:realtime', 'mqtt:spc', 'mqtt:tech'];
      const oneHourAgo = Date.now() - 60 * 60 * 1000; // 1 hour ago in milliseconds
      let totalCleaned = 0;

      for (const queueKey of queueKeys) {
        const queueLength = await this.redis.llen(queueKey);
        if (queueLength === 0) continue;

        // Get all messages and filter out old ones
        const messages = await this.redis.lrange(queueKey, 0, -1);
        const validMessages = [];

        for (const messageStr of messages) {
          try {
            const messageObj = JSON.parse(messageStr);
            const messageTimestamp = messageObj.payload?.timestamp;

            if (messageTimestamp && messageTimestamp > oneHourAgo) {
              validMessages.push(messageStr);
            } else {
              totalCleaned++;
              this.logger.debug(
                `Cleaned old message from ${queueKey}: timestamp ${new Date(messageTimestamp).toISOString()}`,
              );
            }
          } catch (parseError) {
            // Skip invalid JSON messages
            totalCleaned++;
            this.logger.warn(
              `Cleaned invalid message from ${queueKey}: ${parseError.message}`,
            );
          }
        }

        // Replace queue with only valid messages
        if (validMessages.length !== messages.length) {
          await this.redis.del(queueKey);
          if (validMessages.length > 0) {
            await this.redis.lpush(queueKey, ...validMessages.reverse());
          }
          this.logger.log(
            `Cleaned ${messages.length - validMessages.length} old messages from ${queueKey}`,
          );
        }
      }

      if (totalCleaned > 0) {
        this.logger.log(
          `Redis cleanup completed: removed ${totalCleaned} old messages from queues`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to cleanup old messages from Redis queues:',
        error,
      );
    }
  }

  // Health check
  async ping(): Promise<string> {
    if (!this.redis) {
      throw new Error('Redis not connected');
    }
    try {
      return await this.redis.ping();
    } catch (error) {
      this.logger.error('Redis ping failed', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.redis?.disconnect();
      await this.subscriber?.disconnect();
      await this.publisher?.disconnect();
      this.logger.log('Redis connections closed');
    } catch (error) {
      this.logger.error('Error closing Redis connections', error);
    }
  }
}

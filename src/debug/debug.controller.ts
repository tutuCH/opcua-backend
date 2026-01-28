import { Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { InfluxDBService } from '../influxdb/influxdb.service';
import { MqttProcessorService } from '../mqtt-processor/mqtt-processor.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Machine } from '../machines/entities/machine.entity';
import { User } from '../user/entities/user.entity';
import { UserSubscription } from '../subscription/entities/user-subscription.entity';
import { BillingSubscriptionService } from '../subscription/billing-subscription.service';

@Controller('debug')
@Public()
export class DebugController {
  constructor(
    private readonly redisService: RedisService,
    private readonly influxDbService: InfluxDBService,
    private readonly mqttProcessor: MqttProcessorService,
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepository: Repository<UserSubscription>,
    private readonly billingService: BillingSubscriptionService,
  ) {}

  @Get('redis/queue-lengths')
  async getQueueLengths() {
    try {
      const result = await Promise.race([
        Promise.all([
          this.redisService.getQueueLength('mqtt:realtime'),
          this.redisService.getQueueLength('mqtt:spc'),
          this.redisService.getQueueLength('mqtt:tech'),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000),
        ),
      ]);

      const [realtime, spc, tech] = result;

      return {
        success: true,
        'mqtt:realtime': realtime,
        'mqtt:spc': spc,
        'mqtt:tech': tech,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('redis/peek-message/:queue')
  async peekMessage(@Param('queue') queue: string) {
    // Get a message without removing it (peek)
    const message = await this.redisService.dequeueMessage(queue, 1);
    if (message) {
      // Put it back at the front
      await this.redisService.enqueueMessage(queue, message);
      return { message, queue };
    }
    return { message: null, queue };
  }

  @Get('process/single-realtime')
  async processSingleRealtime() {
    try {
      // Use direct Redis dequeue with timeout 0 for immediate response
      const message = await this.redisService.dequeueMessage(
        'mqtt:realtime',
        0,
      );
      if (!message) {
        return {
          error: 'No messages in queue',
          queueLength: await this.redisService.getQueueLength('mqtt:realtime'),
        };
      }

      // Write to InfluxDB
      await this.influxDbService.writeRealtimeData(message.payload);

      // Flush to ensure write
      await this.influxDbService.flush();

      return {
        success: true,
        processedMessage: message,
        remainingInQueue:
          await this.redisService.getQueueLength('mqtt:realtime'),
      };
    } catch (error) {
      return { error: error.message, stack: error.stack };
    }
  }

  @Get('process/single-spc')
  async processSingleSPC() {
    try {
      const message = await this.redisService.dequeueMQTTMessage('mqtt:spc');
      if (!message) {
        return {
          error: 'No messages in queue',
          queueLength: await this.redisService.getQueueLength('mqtt:spc'),
        };
      }

      await this.influxDbService.writeSPCData(message.payload);
      await this.influxDbService.flush();

      return {
        success: true,
        processedMessage: message,
        remainingInQueue: await this.redisService.getQueueLength('mqtt:spc'),
      };
    } catch (error) {
      return { error: error.message, stack: error.stack };
    }
  }

  @Get('influxdb/test-connection')
  async testInfluxConnection() {
    try {
      // Test with a simple write
      const testData = {
        devId: 'test-device',
        topic: 'test',
        sendTime: new Date().toISOString(),
        sendStamp: Date.now(),
        time: new Date().toISOString(),
        timestamp: Date.now(),
        Data: {
          OT: 50.0,
          ASTS: 0,
          OPM: 1,
          STS: 1,
          T1: 220.0,
          T2: 221.0,
          T3: 222.0,
          T4: 223.0,
          T5: 224.0,
          T6: 225.0,
          T7: 226.0,
        },
      };

      await this.influxDbService.writeRealtimeData(testData);
      await this.influxDbService.flush();

      return { success: true, testData };
    } catch (error) {
      return { error: error.message, stack: error.stack };
    }
  }

  @Get('processor/status')
  async getProcessorStatus() {
    try {
      const stats = await this.mqttProcessor.getProcessingStats();
      const isConnected = this.mqttProcessor.isConnected();

      return {
        isConnected,
        processingStats: stats,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  @Get('process/flush-all')
  async processAllMessages() {
    try {
      let processed = 0;
      const maxProcess = 10; // Limit to prevent timeout

      // Process realtime messages
      for (let i = 0; i < maxProcess; i++) {
        const message =
          await this.redisService.dequeueMQTTMessage('mqtt:realtime');
        if (!message) break;

        await this.influxDbService.writeRealtimeData(message.payload);
        processed++;
      }

      // Process SPC messages
      for (let i = 0; i < maxProcess; i++) {
        const message = await this.redisService.dequeueMQTTMessage('mqtt:spc');
        if (!message) break;

        await this.influxDbService.writeSPCData(message.payload);
        processed++;
      }

      await this.influxDbService.flush();

      const remainingQueues = await this.getQueueLengths();

      return {
        success: true,
        processedCount: processed,
        remainingQueues,
      };
    } catch (error) {
      return { error: error.message, stack: error.stack };
    }
  }

  @Get('simple-machine-check')
  async getSimpleMachineCheck() {
    try {
      const machines = await this.machineRepository.find({
        select: ['machineId', 'machineName', 'status'],
      });

      return {
        success: true,
        timestamp: new Date().toISOString(),
        machineCount: machines.length,
        machines: machines.map((m) => ({
          id: m.machineId,
          name: `"${m.machineName}"`, // Quoted to see exact spacing
          status: m.status,
        })),
        targetMachineExists: machines.some(
          (m) => m.machineName === 'postgres machine 1',
        ),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('comprehensive-diagnostic')
  async getComprehensiveDiagnostic() {
    const results: {
      timestamp: string;
      services: {
        mqttProcessor?:
          | {
              connected: boolean;
              stats: any;
            }
          | { error: string };
      };
      machines: {
        count?: number;
        machines?: Array<{
          id: number;
          name: string;
          status: string;
        }>;
        targetMachineCache?: {
          exists: boolean;
          lastUpdate: string | null;
        };
      };
      queues: {
        'mqtt:realtime'?: number;
        'mqtt:spc'?: number;
        'mqtt:tech'?: number;
      };
      errors: string[];
    } = {
      timestamp: new Date().toISOString(),
      services: {},
      machines: {},
      queues: {},
      errors: [],
    };

    try {
      // Check machines in database
      try {
        const machines = await this.machineRepository.find({
          select: ['machineId', 'machineName', 'status'],
        });
        results.machines = {
          count: machines.length,
          machines: machines.map((m) => ({
            id: m.machineId,
            name: m.machineName,
            status: m.status,
          })),
        };
      } catch (error: any) {
        results.errors.push(`Database error: ${error.message}`);
      }

      // Check MQTT processor status
      try {
        results.services.mqttProcessor = {
          connected: this.mqttProcessor.isConnected(),
          stats: await Promise.race([
            this.mqttProcessor.getProcessingStats(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 3000),
            ),
          ]),
        };
      } catch (error: any) {
        results.errors.push(`MQTT processor error: ${error.message}`);
        results.services.mqttProcessor = { error: error.message };
      }

      // Check Redis queues
      try {
        const queueResult = await Promise.race([
          Promise.all([
            this.redisService.getQueueLength('mqtt:realtime'),
            this.redisService.getQueueLength('mqtt:spc'),
            this.redisService.getQueueLength('mqtt:tech'),
          ]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 3000),
          ),
        ]);

        const [realtime, spc, tech] = queueResult;

        results.queues = {
          'mqtt:realtime': realtime,
          'mqtt:spc': spc,
          'mqtt:tech': tech,
        };
      } catch (error: any) {
        results.errors.push(`Redis queue error: ${error.message}`);
      }

      // Check for specific machine status
      if (results.machines.machines?.length > 0) {
        const targetMachine = results.machines.machines.find(
          (m) => m.name === 'postgres machine 1',
        );
        if (targetMachine) {
          try {
            const machineStatus =
              await this.redisService.getMachineStatus('postgres machine 1');
            results.machines.targetMachineCache = {
              exists: !!machineStatus,
              lastUpdate: machineStatus?.lastUpdated || null,
            };
          } catch (error: any) {
            results.errors.push(`Machine cache error: ${error.message}`);
          }
        } else {
          results.errors.push(
            `Target machine "postgres machine 1" not found in database`,
          );
        }
      }

      return results;
    } catch (error: any) {
      results.errors.push(`General diagnostic error: ${error.message}`);
      return results;
    }
  }

  @Get('subscription/user/:userId')
  async getUserSubscriptionDiagnostic(@Param('userId') userId: string) {
    const userIdNum = parseInt(userId, 10);
    const results: any = {
      timestamp: new Date().toISOString(),
      userId: userIdNum,
      database: {},
      stripe: {},
      errors: [],
    };

    try {
      // Check database user record
      const user = await this.userRepository.findOne({
        where: { userId: userIdNum },
      });

      if (!user) {
        results.errors.push('User not found in database');
        return results;
      }

      results.database.user = {
        userId: user.userId,
        username: user.username,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId,
        hasStripeCustomerId: !!user.stripeCustomerId,
      };

      // Check database subscription record
      const subscription = await this.subscriptionRepository.findOne({
        where: { userId: userIdNum },
      });

      if (subscription) {
        results.database.subscription = {
          id: subscription.id,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          stripeCustomerId: subscription.stripeCustomerId,
          planLookupKey: subscription.planLookupKey,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          canceledAt: subscription.canceledAt,
          isExpired:
            subscription.currentPeriodEnd &&
            new Date(subscription.currentPeriodEnd) < new Date(),
        };
      } else {
        results.database.subscription = null;
        results.errors.push('No subscription record found in database');
      }

      // Check Stripe if customer ID exists
      if (user.stripeCustomerId) {
        try {
          // This will use the billing service's stripe instance
          const stripeSubscriptions = await this.billingService[
            'stripe'
          ].subscriptions.list({
            customer: user.stripeCustomerId,
            limit: 10,
          });

          results.stripe.subscriptions = stripeSubscriptions.data.map(
            (sub: any) => {
              const firstItem = sub.items?.data?.[0];
              const periodStart =
                firstItem?.current_period_start || sub.current_period_start;
              const periodEnd =
                firstItem?.current_period_end || sub.current_period_end;
              return {
                id: sub.id,
                status: sub.status,
                created: sub.created
                  ? new Date(sub.created * 1000).toISOString()
                  : null,
                currentPeriodStart: periodStart
                  ? new Date(periodStart * 1000).toISOString()
                  : null,
                currentPeriodEnd: periodEnd
                  ? new Date(periodEnd * 1000).toISOString()
                  : null,
                canceledAt: sub.canceled_at
                  ? new Date(sub.canceled_at * 1000).toISOString()
                  : null,
                planId: firstItem?.price?.lookup_key || firstItem?.price?.id,
              };
            },
          );

          results.stripe.activeSubscriptions = stripeSubscriptions.data.filter(
            (sub) => sub.status === 'active',
          ).length;
          results.stripe.totalSubscriptions = stripeSubscriptions.data.length;
        } catch (error: any) {
          results.errors.push(`Stripe API error: ${error.message}`);
          results.stripe.error = error.message;
        }
      } else {
        results.stripe.error = 'No Stripe customer ID in database';
      }

      // Add sync recommendation
      if (
        results.stripe.activeSubscriptions > 0 &&
        (!subscription || subscription.status !== 'active')
      ) {
        results.recommendation =
          'Active subscription found in Stripe but not in database. Run POST /debug/subscription/sync/' +
          userId +
          ' to sync.';
      }

      return results;
    } catch (error: any) {
      results.errors.push(`Diagnostic error: ${error.message}`);
      return results;
    }
  }

  @Post('subscription/sync/:userId')
  async manualSyncSubscription(@Param('userId') userId: string) {
    const userIdNum = parseInt(userId, 10);
    const results: any = {
      timestamp: new Date().toISOString(),
      userId: userIdNum,
      success: false,
    };

    try {
      // Get user
      const user = await this.userRepository.findOne({
        where: { userId: userIdNum },
      });

      if (!user) {
        results.error = 'User not found';
        return results;
      }

      if (!user.stripeCustomerId) {
        results.error = 'User has no Stripe customer ID';
        return results;
      }

      // Get before state
      const beforeSubscription = await this.subscriptionRepository.findOne({
        where: { userId: userIdNum },
      });
      results.before = beforeSubscription
        ? {
            stripeSubscriptionId: beforeSubscription.stripeSubscriptionId,
            status: beforeSubscription.status,
            currentPeriodEnd: beforeSubscription.currentPeriodEnd,
          }
        : null;

      // Get active subscriptions from Stripe
      const stripeSubscriptions = await this.billingService[
        'stripe'
      ].subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
        expand: ['data.items.data.price.product'],
      });

      if (stripeSubscriptions.data.length === 0) {
        results.error = 'No active subscriptions found in Stripe';
        results.stripeSubscriptionCount = 0;
        return results;
      }

      // Use the first active subscription
      const stripeSubscription = stripeSubscriptions.data[0];
      const price = stripeSubscription.items.data[0]?.price;
      const firstItem = stripeSubscription.items.data[0];

      // Sync to database using the billing service's updateUserSubscription method
      await this.billingService['updateUserSubscription'](userIdNum, {
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: user.stripeCustomerId,
        planLookupKey: price?.lookup_key || stripeSubscription.id,
        status: stripeSubscription.status,
        currentPeriodStart: firstItem
          ? new Date(firstItem.current_period_start * 1000)
          : null,
        currentPeriodEnd: firstItem
          ? new Date(firstItem.current_period_end * 1000)
          : null,
      });

      // Get after state
      const afterSubscription = await this.subscriptionRepository.findOne({
        where: { userId: userIdNum },
      });
      results.after = afterSubscription
        ? {
            stripeSubscriptionId: afterSubscription.stripeSubscriptionId,
            status: afterSubscription.status,
            currentPeriodEnd: afterSubscription.currentPeriodEnd,
          }
        : null;

      results.success = true;
      results.message = 'Subscription synced successfully from Stripe';
      results.stripeSubscriptionId = stripeSubscription.id;

      return results;
    } catch (error: any) {
      results.error = error.message;
      results.stack = error.stack;
      return results;
    }
  }

  @Get('subscription/database-state')
  async getSubscriptionDatabaseState() {
    const results: any = {
      timestamp: new Date().toISOString(),
    };

    try {
      // Get all user subscriptions
      const allSubscriptions = await this.subscriptionRepository.find({
        order: { createdAt: 'DESC' },
        take: 20,
      });

      results.totalSubscriptions = allSubscriptions.length;
      results.subscriptions = allSubscriptions.map((sub) => ({
        id: sub.id,
        userId: sub.userId,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        stripeCustomerId: sub.stripeCustomerId,
        planLookupKey: sub.planLookupKey,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        isExpired:
          sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date(),
      }));

      // Get all users with Stripe customer IDs
      const usersWithStripe = await this.userRepository
        .createQueryBuilder('user')
        .where('user.stripe_customer_id IS NOT NULL')
        .select([
          'user.userId',
          'user.username',
          'user.email',
          'user.stripe_customer_id',
        ])
        .getMany();

      results.usersWithStripeCustomerId = usersWithStripe.length;
      results.users = usersWithStripe.map((user) => ({
        userId: user.userId,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId,
      }));

      // Detect orphaned records
      const orphanedUsers = usersWithStripe.filter(
        (user) => !allSubscriptions.some((sub) => sub.userId === user.userId),
      );

      results.orphanedUsers = orphanedUsers.map((user) => ({
        userId: user.userId,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId,
        note: 'User has Stripe customer ID but no subscription record in database',
      }));

      return results;
    } catch (error: any) {
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
      };
    }
  }
}

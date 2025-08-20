import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingSubscriptionController } from './billing-subscription.controller';
import { WebhookController } from './webhook.controller';
import { BillingSubscriptionService } from './billing-subscription.service';
import { User } from '../user/entities/user.entity';
import { UserSubscription } from './entities/user-subscription.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User, UserSubscription])],
  controllers: [BillingSubscriptionController, WebhookController],
  providers: [BillingSubscriptionService],
  exports: [BillingSubscriptionService],
})
export class SubscriptionModule {}

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/strategies/auth.guard';
import { JwtUserId } from '../auth/decorators/jwt-user-id.decorator';
import { BillingSubscriptionService } from './billing-subscription.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';

const THROTTLE_SHORT = {
  short: { limit: 3, ttl: 1000 },
};

const THROTTLE_MEDIUM = {
  medium: { limit: 20, ttl: 10000 },
};

const THROTTLE_LONG = {
  long: { limit: 100, ttl: 60000 },
};

@Controller('api/subscription')
@UseGuards(JwtAuthGuard)
export class BillingSubscriptionController {
  constructor(
    private readonly billingSubscriptionService: BillingSubscriptionService,
  ) {}

  @Post('create-checkout-session')
  @Throttle(THROTTLE_SHORT)
  @HttpCode(HttpStatus.OK)
  async createCheckoutSession(
    @Body() createCheckoutSessionDto: CreateCheckoutSessionDto,
    @JwtUserId() userId: number,
  ) {
    return this.billingSubscriptionService.createCheckoutSession(
      createCheckoutSessionDto,
      userId,
    );
  }

  @Post('create-portal-session')
  @Throttle(THROTTLE_SHORT)
  @HttpCode(HttpStatus.OK)
  async createPortalSession(
    @Body() createPortalSessionDto: CreatePortalSessionDto,
    @JwtUserId() userId: number,
  ) {
    return this.billingSubscriptionService.createPortalSession(
      createPortalSessionDto,
      userId,
    );
  }

  @Get('current')
  @Throttle(THROTTLE_MEDIUM)
  async getCurrentSubscription(@JwtUserId() userId: number) {
    return this.billingSubscriptionService.getCurrentSubscription(userId);
  }

  @Get('plans')
  @Throttle(THROTTLE_LONG)
  async getSubscriptionPlans() {
    return this.billingSubscriptionService.getSubscriptionPlans();
  }

  @Get('payment-methods')
  @Throttle(THROTTLE_MEDIUM)
  async getPaymentMethods(@JwtUserId() userId: number) {
    return this.billingSubscriptionService.getPaymentMethods(userId);
  }

  @Delete(':subscriptionId')
  @Throttle(THROTTLE_SHORT)
  @HttpCode(HttpStatus.OK)
  async cancelSubscription(
    @Param('subscriptionId') subscriptionId: string,
    @JwtUserId() userId: number,
  ) {
    return this.billingSubscriptionService.cancelSubscription(
      subscriptionId,
      userId,
    );
  }
}

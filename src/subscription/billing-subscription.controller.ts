import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/strategies/auth.guard';
import { JwtUserId } from '../auth/decorators/jwt-user-id.decorator';
import { BillingSubscriptionService } from './billing-subscription.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';

@Controller('api/subscription')
@UseGuards(JwtAuthGuard)
export class BillingSubscriptionController {
  constructor(
    private readonly billingSubscriptionService: BillingSubscriptionService,
  ) {}

  @Post('create-checkout-session')
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
  async getCurrentSubscription(@JwtUserId() userId: number) {
    return this.billingSubscriptionService.getCurrentSubscription(userId);
  }

  @Get('plans')
  async getSubscriptionPlans() {
    return this.billingSubscriptionService.getSubscriptionPlans();
  }

  @Get('payment-methods')
  async getPaymentMethods(@JwtUserId() userId: number) {
    return this.billingSubscriptionService.getPaymentMethods(userId);
  }
}

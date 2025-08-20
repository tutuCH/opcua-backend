import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Headers,
  BadRequestException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Public } from '../auth/decorators/public.decorator';
import { BillingSubscriptionService } from './billing-subscription.service';

@Controller('api/webhooks')
export class WebhookController {
  private readonly stripe: Stripe;

  constructor(
    private readonly billingSubscriptionService: BillingSubscriptionService,
    private readonly configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2025-07-30.basil',
      },
    );
  }

  @Post('stripe')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    console.log('🔥 Webhook received!');
    
    // Get the raw body from the request
    const rawBody = req.rawBody || req.body;
    console.log('📦 Raw body type:', typeof rawBody);
    console.log('📦 Raw body present:', !!rawBody);
    console.log('📦 Signature present:', !!signature);
    
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    console.log('📝 Webhook secret configured:', !!webhookSecret);

    if (!webhookSecret) {
      console.error('❌ Webhook secret not configured');
      throw new BadRequestException('Webhook secret not configured');
    }

    if (!rawBody) {
      console.error('❌ No webhook payload received');
      throw new BadRequestException('No webhook payload was provided');
    }

    if (!signature) {
      console.error('❌ No stripe signature header');
      throw new BadRequestException('No stripe signature header');
    }

    // Ensure we have a Buffer for Stripe webhook verification
    let body: Buffer;
    if (Buffer.isBuffer(rawBody)) {
      body = rawBody;
    } else if (typeof rawBody === 'string') {
      body = Buffer.from(rawBody, 'utf8');
    } else {
      console.error('❌ Unsupported body type:', typeof rawBody);
      throw new BadRequestException('Unsupported webhook payload format');
    }

    console.log('📦 Buffer length:', body.length);

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret,
      );
      console.log('✅ Webhook signature verified, event type:', event.type);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    try {
      await this.billingSubscriptionService.handleWebhookEvent(event);
      console.log('✅ Webhook event processed successfully');
    } catch (error) {
      console.error('❌ Error processing webhook event:', error);
      throw error;
    }

    return { received: true };
  }
}

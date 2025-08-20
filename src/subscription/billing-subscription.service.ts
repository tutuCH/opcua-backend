import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { User } from '../user/entities/user.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';

@Injectable()
export class BillingSubscriptionService {
  private readonly logger = new Logger(BillingSubscriptionService.name);
  private readonly stripe: Stripe;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepository: Repository<UserSubscription>,
    private readonly configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2025-07-30.basil',
      },
    );
  }

  async createCheckoutSession(
    createCheckoutSessionDto: CreateCheckoutSessionDto,
    userId: number,
  ) {
    try {
      const { lookupKey, successUrl, cancelUrl } = createCheckoutSessionDto;
      this.logger.log(
        `Creating checkout session for user ${userId} with lookup key ${lookupKey}`,
      );

      let price: Stripe.Price;

      // Check if lookupKey is a price ID (starts with 'price_') or product ID (starts with 'prod_')
      if (lookupKey.startsWith('price_')) {
        // It's already a price ID, fetch it directly
        price = await this.stripe.prices.retrieve(lookupKey, {
          expand: ['product'],
        });
      } else if (lookupKey.startsWith('prod_')) {
        // It's a product ID, get the default price for this product
        const prices = await this.stripe.prices.list({
          product: lookupKey,
          active: true,
          expand: ['data.product'],
        });

        if (prices.data.length === 0) {
          throw new BadRequestException(
            `No active price found for product: ${lookupKey}`,
          );
        }

        price = prices.data[0];
      } else {
        // It's a lookup key, use the original logic
        const prices = await this.stripe.prices.list({
          lookup_keys: [lookupKey],
          expand: ['data.product'],
        });

        if (prices.data.length === 0) {
          throw new BadRequestException(
            `No price found for lookup key: ${lookupKey}`,
          );
        }

        price = prices.data[0];
      }

      // Get user details
      const user = await this.userRepository.findOne({ where: { userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Get or create Stripe customer
      const customer = await this.findOrCreateStripeCustomer(
        userId,
        user.email,
      );

      // Create Checkout Session
      const session = await this.stripe.checkout.sessions.create({
        billing_address_collection: 'auto',
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customer.id,
        metadata: {
          user_id: userId.toString(),
          lookup_key: lookupKey,
        },
        subscription_data: {
          metadata: {
            user_id: userId.toString(),
            lookup_key: lookupKey,
          },
        },
        automatic_tax: { enabled: true },
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
      });

      return {
        status: 'success',
        data: {
          url: session.url,
          sessionId: session.id,
        },
      };
    } catch (error) {
      this.logger.error('Error creating checkout session:', error);
      throw new BadRequestException('Failed to create checkout session');
    }
  }

  async createPortalSession(
    createPortalSessionDto: CreatePortalSessionDto,
    userId: number,
  ) {
    try {
      const { returnUrl } = createPortalSessionDto;
      this.logger.log(`Creating portal session for user ${userId}`);

      // Get user's Stripe customer ID
      const user = await this.userRepository.findOne({ where: { userId } });

      if (!user || !user.stripeCustomerId) {
        throw new BadRequestException('No active subscription found');
      }

      // Create portal session
      const portalSession = await this.stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: returnUrl,
      });

      return {
        status: 'success',
        data: {
          url: portalSession.url,
        },
      };
    } catch (error) {
      this.logger.error('Error creating portal session:', error);
      throw new BadRequestException('Failed to create portal session');
    }
  }

  async getCurrentSubscription(userId: number) {
    this.logger.log(`Getting current subscription for user ${userId}`);

    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return { subscription: null };
    }

    try {
      // Fetch latest subscription data from Stripe
      const stripeSubscription = await this.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
        { expand: ['items.data.price.product'] },
      );

      const price = stripeSubscription.items.data[0]?.price;
      const product = price?.product as Stripe.Product;

      const firstItem = stripeSubscription.items.data[0];
      console.log('🔍 Stripe subscription periods:', {
        current_period_start: firstItem?.current_period_start,
        current_period_end: firstItem?.current_period_end,
        start_date: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
        end_date: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
      });

      return {
        subscription: {
          id: stripeSubscription.id,
          status: stripeSubscription.status,
          plan: {
            id: price?.lookup_key || subscription.planLookupKey,
            name: product?.name || 'Unknown Plan',
            price: price ? price.unit_amount / 100 : 0,
            currency: price?.currency?.toUpperCase() || 'USD',
            interval: price?.recurring?.interval || 'month',
          },
          currentPeriodStart: firstItem?.current_period_start,
          currentPeriodEnd: firstItem?.current_period_end,
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        },
      };
    } catch (error) {
      this.logger.error('Error fetching subscription from Stripe:', error);
      return { subscription: null };
    }
  }

  async getSubscriptionPlans() {
    this.logger.log('Getting subscription plans from Stripe');

    try {
      // Fetch all prices with lookup keys from Stripe
      const prices = await this.stripe.prices.list({
        expand: ['data.product'],
        active: true,
      });

      const plans = prices.data
        .filter((price) => price.recurring) // Temporarily remove lookup_key requirement
        .map((price) => {
          const product = price.product as Stripe.Product;
          return {
            id: price.lookup_key || price.id, // Use price ID if no lookup key
            name: product.name,
            description: product.description || '',
            price: price.unit_amount / 100,
            currency: price.currency.toUpperCase(),
            interval: price.recurring.interval,
            features: product.metadata?.features
              ? JSON.parse(product.metadata.features)
              : [],
            popular: product.metadata?.popular === 'true',
          };
        });

      return { plans };
    } catch (error) {
      this.logger.error('Error fetching subscription plans:', error);
      // Fallback to hardcoded plans if Stripe is unavailable
      return {
        plans: [
          {
            id: 'basic_monthly',
            name: 'Basic',
            description: 'Perfect for small projects',
            price: 9.99,
            currency: 'USD',
            interval: 'month',
            features: ['Up to 5 machines', 'Basic monitoring', 'Email support'],
          },
          {
            id: 'professional_monthly',
            name: 'Professional',
            description: 'Best for growing businesses',
            price: 29.99,
            currency: 'USD',
            interval: 'month',
            features: [
              'Up to 50 machines',
              'Advanced monitoring',
              'Real-time alerts',
              'Priority support',
            ],
            popular: true,
          },
          {
            id: 'enterprise_monthly',
            name: 'Enterprise',
            description: 'For large scale operations',
            price: 99.99,
            currency: 'USD',
            interval: 'month',
            features: [
              'Unlimited machines',
              'Custom integrations',
              'Dedicated support',
              'SLA guarantee',
            ],
          },
        ],
      };
    }
  }

  async getPaymentMethods(userId: number) {
    this.logger.log(`Getting payment methods for user ${userId}`);

    try {
      // Get user's Stripe customer ID
      const user = await this.userRepository.findOne({ where: { userId } });

      if (!user || !user.stripeCustomerId) {
        throw new NotFoundException('No customer found');
      }

      // Retrieve payment methods from Stripe
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      });

      // Format the response
      const formattedMethods = paymentMethods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
        is_default: false, // You can implement default payment method tracking if needed
      }));

      return {
        status: 'success',
        data: {
          payment_methods: formattedMethods,
        },
      };
    } catch (error) {
      this.logger.error('Error retrieving payment methods:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve payment methods');
    }
  }

  async updateUserSubscription(
    userId: number,
    subscriptionData: Partial<UserSubscription>,
  ) {
    let subscription = await this.subscriptionRepository.findOne({
      where: { userId },
    });

    if (!subscription) {
      subscription = this.subscriptionRepository.create({
        userId,
        ...subscriptionData,
      });
    } else {
      Object.assign(subscription, subscriptionData);
    }

    return this.subscriptionRepository.save(subscription);
  }

  private async findOrCreateStripeCustomer(
    userId: number,
    email: string,
  ): Promise<Stripe.Customer> {
    // First, check if user already has a Stripe customer ID in database
    const user = await this.userRepository.findOne({ where: { userId } });

    if (user.stripeCustomerId) {
      try {
        const customer = await this.stripe.customers.retrieve(
          user.stripeCustomerId,
        );
        if (!customer.deleted) {
          return customer as Stripe.Customer;
        }
      } catch (error) {
        this.logger.warn(
          `Stripe customer ${user.stripeCustomerId} not found, creating new one`,
        );
      }
    }

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      email: email,
      metadata: {
        user_id: userId.toString(),
      },
    });

    // Save Stripe customer ID to database
    await this.userRepository.update(userId, {
      stripeCustomerId: customer.id,
    });

    return customer;
  }

  async handleWebhookEvent(event: Stripe.Event) {
    this.logger.log(`Processing webhook event: ${event.type} - ${event.id}`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;

        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(
            event.data.object as Stripe.Subscription,
          );
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
          );
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(
            event.data.object as Stripe.Invoice,
          );
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice,
          );
          break;

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('Error processing webhook event:', error);
      throw error;
    }
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ) {
    this.logger.log('🎉 Checkout session completed:', session.id);
    console.log('🎉 Checkout session completed:', session.id);

    const userId = session.metadata?.user_id;
    const lookupKey = session.metadata?.lookup_key;

    console.log('📋 Session metadata:', { userId, lookupKey });

    if (!userId) {
      this.logger.error('❌ No user_id in session metadata');
      console.error('❌ No user_id in session metadata');
      return;
    }

    if (session.subscription) {
      console.log('🔄 Retrieving subscription:', session.subscription);
      const subscription = await this.stripe.subscriptions.retrieve(
        session.subscription as string,
      );

      console.log('💾 Updating user subscription for user:', userId);
      const firstItem = subscription.items.data[0];
      const updatedSubscription = await this.updateUserSubscription(Number(userId), {
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        planLookupKey: lookupKey,
        status: subscription.status,
        currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
        currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
      });

      console.log('✅ Subscription saved to database:', updatedSubscription);

      this.logger.log(
        `Subscription ${subscription.id} activated for user ${userId}`,
      );
    } else {
      console.log('⚠️ No subscription found in session');
    }
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription) {
    this.logger.log('Subscription created:', subscription.id);

    const userId = subscription.metadata?.user_id;
    const lookupKey = subscription.metadata?.lookup_key;

    if (userId) {
      const firstItem = subscription.items.data[0];
      await this.updateUserSubscription(Number(userId), {
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        planLookupKey: lookupKey,
        status: subscription.status,
        currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
        currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
      });
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    this.logger.log('Subscription updated:', subscription.id);

    const userId = subscription.metadata?.user_id;

    if (userId) {
      const firstItem = subscription.items.data[0];
      await this.updateUserSubscription(Number(userId), {
        status: subscription.status,
        currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : null,
        currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
      });
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    this.logger.log('Subscription deleted:', subscription.id);

    const userId = subscription.metadata?.user_id;

    if (userId) {
      await this.updateUserSubscription(Number(userId), {
        status: 'canceled',
        canceledAt: new Date(),
      });
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    this.logger.log('Invoice payment succeeded:', invoice.id);

    if ((invoice as any).subscription) {
      const subscription = await this.stripe.subscriptions.retrieve(
        (invoice as any).subscription as string,
      );
      const userId = subscription.metadata?.user_id;

      if (userId) {
        const firstItem = subscription.items.data[0];
        await this.updateUserSubscription(Number(userId), {
          status: 'active',
          currentPeriodStart: firstItem ? new Date(
            firstItem.current_period_start * 1000,
          ) : null,
          currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
          lastPaymentDate: new Date(),
        });
      }
    }
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    this.logger.log('Invoice payment failed:', invoice.id);

    if ((invoice as any).subscription) {
      const subscription = await this.stripe.subscriptions.retrieve(
        (invoice as any).subscription as string,
      );
      const userId = subscription.metadata?.user_id;

      if (userId) {
        await this.updateUserSubscription(Number(userId), {
          status: 'past_due',
          paymentFailedAt: new Date(),
        });
      }
    }
  }
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('user_subscriptions')
export class UserSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({
    name: 'stripe_subscription_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  stripeSubscriptionId: string;

  @Column({
    name: 'stripe_customer_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  stripeCustomerId: string;

  @Column({
    name: 'plan_lookup_key',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  planLookupKey: string;

  @Column({ type: 'varchar', length: 50, default: 'inactive' })
  status: string;

  @Column({ name: 'current_period_start', type: 'timestamp', nullable: true })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'timestamp', nullable: true })
  currentPeriodEnd: Date;

  @Column({ name: 'canceled_at', type: 'timestamp', nullable: true })
  canceledAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'last_payment_date', type: 'timestamp', nullable: true })
  lastPaymentDate: Date;

  @Column({ name: 'payment_failed_at', type: 'timestamp', nullable: true })
  paymentFailedAt: Date;

  @ManyToOne(() => User, (user) => user.subscription)
  @JoinColumn({ name: 'user_id' })
  user: User;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Machine } from './../../machines/entities/machine.entity';
import { Factory } from '../../factories/entities/factory.entity';
import { UserSubscription } from '../../subscription/entities/user-subscription.entity';

export type UserStatus = 'active' | 'pending_verification' | 'inactive';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  userId: number;

  @Column({ type: 'varchar', length: 255 })
  username: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 255 })
  accessLevel: string;

  @Column({
    name: 'stripe_customer_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  stripeCustomerId: string;

  @Column({
    type: 'enum',
    enum: ['active', 'pending_verification', 'inactive'],
    default: 'pending_verification',
  })
  status: UserStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Machine, (machine) => machine.user)
  machines: Machine[];

  @OneToMany(() => Factory, (factory) => factory.user)
  factory: Factory[];

  @OneToOne(() => UserSubscription, (subscription) => subscription.user)
  subscription: UserSubscription;
}

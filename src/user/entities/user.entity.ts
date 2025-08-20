import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Machine } from './../../machines/entities/machine.entity';
import { Factory } from '../../factories/entities/factory.entity';
import { UserSubscription } from '../../subscription/entities/user-subscription.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Machine, (machine) => machine.user)
  machines: Machine[];

  @OneToMany(() => Factory, (factory) => factory.user)
  factory: Factory[];

  @OneToOne(() => UserSubscription, (subscription) => subscription.user)
  subscription: UserSubscription;
}

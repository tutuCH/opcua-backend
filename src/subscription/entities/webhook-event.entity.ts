import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index()
  eventId: string;

  @Column()
  eventType: string;

  @Column({ default: false })
  processed: boolean;

  @Column({ nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;
}

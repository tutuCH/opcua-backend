import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Factory } from '../../factories/entities/factory.entity';

@Entity()
export class Machine {
  @PrimaryGeneratedColumn()
  machineId: number;

  @Column({ type: 'varchar', length: 255 })
  machineName: string;

  @Column({ type: 'varchar', length: 255 })
  // @Unique('machine_ip_address', ['machineIpAddress'])
  machineIpAddress: string;

  @Column({ type: 'int' })
  machineIndex: string;

  @ManyToOne(() => User, (user) => user.machines)
  user: User;

  @ManyToOne(() => Factory, (factory) => factory.machines)
  factory: Factory;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}

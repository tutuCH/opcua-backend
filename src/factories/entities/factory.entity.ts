import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { Machine } from './../../machines/entities/machine.entity';
import { User } from 'src/user/entities/user.entity';

@Entity()
export class Factory {
  @PrimaryGeneratedColumn()
  factoryId: number;

  @Column({ type: 'varchar', length: 255 })
  factoryName: string;

  @Column({ type: 'int' })
  factoryIndex: string;

  @Column({ type: 'int' })
  width: string;

  @Column({ type: 'int' })
  height: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.factory)
  user: User;

  @OneToMany(() => Machine, (machine) => machine.factory)
  machines: Machine[];
}

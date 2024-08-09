import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { Machine } from './../../machines/entities/machine.entity';
import { Factory } from '../../factories/entities/factory.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Machine, (machine) => machine.user)
  machines: Machine[];

  @OneToMany(() => Factory, (factory) => factory.user)
  factory: Factory[];  
}

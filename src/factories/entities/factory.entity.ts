import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { Machine } from './../../machines/entities/machine.entity';

@Entity()
export class Factory {
  @PrimaryGeneratedColumn()
  factoryId: number;

  @Column({ type: 'varchar', length: 255 })
  factoryName: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Machine, (machine) => machine.factory)
  machines: Machine[];
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('reminders')
@Index(['loanId'])
@Index(['sentAt'])
export class Reminder {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  loanId!: number; // References loans.id

  @Column({ type: 'datetime' })
  sentAt!: Date;

  @Column({ type: 'varchar', length: 50 })
  channel!: string; // EMAIL, SMS, etc.

  @CreateDateColumn()
  createdAt!: Date;
}

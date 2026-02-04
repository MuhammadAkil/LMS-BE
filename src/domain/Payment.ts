import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('payments')
@Index(['userId'])
@Index(['loanId'])
@Index(['statusId'])
@Index(['createdAt'])
export class Payment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  userId!: number; // References users.id

  @Column({ type: 'bigint', nullable: true })
  loanId?: number; // References loans.id

  @Column({ type: 'int' })
  paymentTypeId!: number; // References payment_types

  @Column({ type: 'int', nullable: true })
  providerId?: number; // References payment_providers

  @Column({ type: 'int' })
  statusId!: number; // References payment_statuses

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @CreateDateColumn()
  createdAt!: Date;
}

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
@Index(['courseId'])
@Index(['sessionId'])
@Index(['statusId'])
@Index(['createdAt'])
export class Payment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  userId!: number; // References users.id

  @Column({ type: 'bigint', nullable: true })
  loanId?: number; // References loans.id

  @Column({ type: 'bigint', nullable: true, name: 'application_id' })
  applicationId?: number; // References loan_applications.id

  @Column({ type: 'varchar', length: 30, nullable: true, name: 'payment_step' })
  paymentStep?: string; // PORTAL_COMMISSION | VOLUNTARY_COMMISSION | LOAN_REPAYMENT

  @Column({ type: 'bigint', nullable: true })
  courseId?: number; // References courses (LMS)

  @Column({ type: 'int' })
  paymentTypeId!: number; // References payment_types

  @Column({ type: 'int', nullable: true })
  providerId?: number; // References payment_providers

  @Column({ type: 'int' })
  statusId!: number; // References payment_statuses

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  /** P24 session id (UUID) sent to gateway and in webhook */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'session_id' })
  sessionId?: string;

  /** When payment was completed (set after webhook verification) */
  @Column({ type: 'datetime', nullable: true, name: 'paid_at' })
  paidAt?: Date;

  /** Provider order id from P24 (webhook orderId) */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'provider_order_id' })
  providerOrderId?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

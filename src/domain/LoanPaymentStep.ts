import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('loan_payment_steps')
@Index(['loanApplicationId'])
export class LoanPaymentStep {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint', name: 'loan_application_id' })
  loanApplicationId!: number;

  @Column({ type: 'varchar', length: 30 })
  step!: string; // PORTAL_COMMISSION | VOLUNTARY_COMMISSION

  @Column({ type: 'bigint', nullable: true, name: 'payment_id' })
  paymentId?: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: string; // PENDING | PAID | FAILED

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'datetime', nullable: true, name: 'paid_at' })
  paidAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

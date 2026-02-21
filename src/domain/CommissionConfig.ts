import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('commission_configs')
@Index(['configType'])
@Index(['status'])
export class CommissionConfig {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 30, name: 'config_type' })
  configType!: string; // PORTAL | VOLUNTARY | MANAGEMENT

  @Column({ type: 'int', nullable: true, name: 'borrower_level' })
  borrowerLevel?: number; // NULL = all levels

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, name: 'min_loan_amount' })
  minLoanAmount?: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, name: 'max_loan_amount' })
  maxLoanAmount?: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, name: 'commission_pct' })
  commissionPct!: number; // e.g. 0.0200 = 2%

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'lender_frequent_payout_fee' })
  lenderFrequentPayoutFee?: number; // charged if payout > 1/month

  @Column({ type: 'int', default: 5, name: 'default_payout_day' })
  defaultPayoutDay!: number; // 5th of following month

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status!: string; // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED

  @Column({ type: 'int', name: 'created_by' })
  createdBy!: number;

  @Column({ type: 'int', nullable: true, name: 'approved_by' })
  approvedBy?: number;

  @Column({ type: 'datetime', nullable: true, name: 'approved_at' })
  approvedAt?: Date;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'rejection_reason' })
  rejectionReason?: string;

  @Column({ type: 'date', nullable: true, name: 'effective_from' })
  effectiveFrom?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

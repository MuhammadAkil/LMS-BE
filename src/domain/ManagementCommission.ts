import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('management_commissions')
@Index(['companyId'])
@Index(['status'])
export class ManagementCommission {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint', name: 'company_id' })
  companyId!: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, name: 'commission_pct' })
  commissionPct!: number; // % of paid-in capital

  @Column({ type: 'varchar', length: 30, default: 'PAID_IN_CAPITAL', name: 'calculation_basis' })
  calculationBasis!: string; // PAID_IN_CAPITAL | AUM

  @Column({ type: 'varchar', length: 20, default: 'ANNUAL', name: 'payout_period' })
  payoutPeriod!: string; // ANNUAL | QUARTERLY

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

  @Column({ type: 'int', nullable: true, name: 'effective_year' })
  effectiveYear?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

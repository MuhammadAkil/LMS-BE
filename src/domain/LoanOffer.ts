import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('loan_offers')
@Index(['loanId'])
@Index(['lenderId'])
@Index(['createdAt'])
export class LoanOffer {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  loanId!: number; // References loans.id

  @Column({ type: 'bigint' })
  lenderId!: number; // References users.id

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  /** Set at loan close (pro-rata); null while offer is pending */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'confirmed_amount' })
  confirmedAmount?: number;

  @CreateDateColumn()
  createdAt!: Date;

  /**
   * Compatibility note:
   * Some deployed DB instances still miss this column.
   * Keep it non-selectable/non-writable so core offer flows can run.
   */
  @Column({ type: 'datetime', nullable: true, select: false, insert: false, update: false, name: 'updatedAt' })
  updatedAt?: Date | null;

  /** Set when company places a delegated offer for lender approval */
  @Column({ type: 'bigint', nullable: true, name: 'delegated_by_company_id', select: false, insert: false, update: false })
  delegatedByCompanyId?: number | null;

  /**
   * Delegated flow statuses:
   * - PENDING_LENDER_APPROVAL (24h)
   * - PENDING_LENDER_PAYMENT (2h)
   * - ACTIVE (lender paid)
   * - REJECTED / EXPIRED
   * null = standard manual lender offer flow
   */
  @Column({ type: 'varchar', length: 40, nullable: true, name: 'delegated_status', select: false, insert: false, update: false })
  delegatedStatus?: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'delegated_approval_expires_at', select: false, insert: false, update: false })
  delegatedApprovalExpiresAt?: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'delegated_approved_at', select: false, insert: false, update: false })
  delegatedApprovedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'delegated_payment_due_at', select: false, insert: false, update: false })
  delegatedPaymentDueAt?: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'delegated_payment_status', select: false, insert: false, update: false })
  delegatedPaymentStatus?: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'delegated_paid_at', select: false, insert: false, update: false })
  delegatedPaidAt?: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'delegated_commission_amount', select: false, insert: false, update: false })
  delegatedCommissionAmount?: number | null;
}

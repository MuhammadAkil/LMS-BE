import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type DisbursementSenderType = 'LENDER' | 'COMPANY';

@Entity('loan_disbursements')
@Index(['loanId'])
@Index(['senderType'])
export class LoanDisbursement {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint', name: 'loan_id' })
  loanId!: number;

  @Column({ type: 'varchar', length: 20, name: 'sender_type' })
  senderType!: DisbursementSenderType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'date', name: 'transfer_date' })
  transferDate!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'reference_number' })
  referenceNumber?: string;

  @Column({ type: 'bigint', nullable: true, name: 'confirmed_by_lender_id' })
  confirmedByLenderId?: number;

  @Column({ type: 'bigint', nullable: true, name: 'confirmed_by_company_id' })
  confirmedByCompanyId?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

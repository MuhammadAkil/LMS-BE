import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('loans')
@Index(['applicationId'])
@Index(['borrowerId'])
@Index(['statusId'])
@Index(['dueDate'])
export class Loan {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  applicationId!: number; // References loan_applications.id

  @Column({ type: 'bigint' })
  borrowerId!: number; // References users.id

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fundedAmount!: number;

  @Column({ type: 'int' })
  statusId!: number; // References loan_statuses

  @Column({ type: 'date' })
  dueDate!: Date;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true, name: 'interest_rate' })
  interestRate?: number;

  @Column({ type: 'varchar', length: 20, default: 'LUMP_SUM', name: 'repayment_type' })
  repaymentType!: string; // LUMP_SUM | INSTALLMENTS

  @Column({ type: 'int', nullable: true, name: 'installment_count' })
  installmentCount?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'voluntary_commission' })
  voluntaryCommission!: number;

  @Column({ type: 'boolean', default: false, name: 'lender_data_revealed' })
  lenderDataRevealed!: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'lender_data_revealed_at' })
  lenderDataRevealedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

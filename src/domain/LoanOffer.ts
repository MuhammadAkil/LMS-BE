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
}

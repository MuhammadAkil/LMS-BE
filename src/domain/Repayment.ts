import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('repayments')
@Index(['loanId'])
@Index(['dueDate'])
export class Repayment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  loanId!: number; // References loans.id

  @Column({ type: 'date' })
  dueDate!: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'datetime', nullable: true })
  paidAt?: Date;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('loan_duration_configs')
export class LoanDurationConfig {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 50 })
  label!: string; // '7 days', '14 days', '1 month', etc.

  @Column({ type: 'int', nullable: true, name: 'duration_days' })
  durationDays?: number; // for day-based durations

  @Column({ type: 'int', nullable: true, name: 'duration_months' })
  durationMonths?: number; // for month-based durations

  @Column({ type: 'varchar', length: 20, name: 'repayment_type' })
  repaymentType!: string; // LUMP_SUM | INSTALLMENTS

  @Column({ type: 'boolean', default: true, name: 'is_enabled' })
  isEnabled!: boolean;

  @Column({ type: 'int', default: 0, name: 'sort_order' })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

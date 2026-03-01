import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('interest_rates')
@Index(['effectiveFrom'])
@Index(['status'])
export class InterestRate {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, name: 'rate' })
  rate!: number; // e.g. 0.0750 = 7.50%

  @Column({ type: 'decimal', precision: 5, scale: 4, name: 'max_rate' })
  maxRate!: number; // regulatory maximum

  @Column({ type: 'date', name: 'effective_from' })
  effectiveFrom!: Date;

  @Column({ type: 'date', nullable: true, name: 'effective_to' })
  effectiveTo?: Date;

  @Column({ type: 'int', name: 'created_by' })
  createdBy!: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: string; // ACTIVE | INACTIVE

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

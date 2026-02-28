import {
  Column,
  PrimaryColumn,
} from 'typeorm';

// NOTE: This file is superseded by LevelRules.ts which maps the same table.
// The @Entity decorator has been removed to prevent TypeORM sync conflicts.
// Use LevelRules entity instead.
export class LevelRule {
  @PrimaryColumn({ type: 'int' })
  level!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxLoanAmount?: number;

  @Column({ type: 'int', nullable: true })
  maxActiveLoans?: number;

  @Column({ type: 'int', nullable: true })
  maxApplications?: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  commissionPercent?: number;
}

import {
    Entity,
    Column,
    PrimaryColumn,
} from 'typeorm';

@Entity('level_rules')
export class LevelRules {
    @PrimaryColumn({ type: 'int' })
    level!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    maxLoanAmount?: number;

    @Column({ type: 'int', nullable: true })
    maxActiveLoans?: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    minAmount?: number;

    @Column({ type: 'int', nullable: true })
    maxApplications?: number;

    @Column({ type: 'int', nullable: true })
    minDuration?: number;

    @Column({ type: 'int', nullable: true })
    maxDuration?: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    commissionPercent?: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description?: string;
}

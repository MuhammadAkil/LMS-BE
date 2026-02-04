import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';

@Entity('loan_applications')
@Index(['borrowerId', 'statusId'])
@Index(['statusId'])
export class LoanApplication {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: number;

    @Column({ type: 'bigint' })
    borrowerId!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount!: number;

    @Column({ type: 'int' })
    durationMonths!: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    purpose?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    purposeCode?: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'int' })
    statusId!: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    fundedPercent!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    fundedAmount!: number;

    @Column({ type: 'bigint', nullable: true })
    commissionPaymentId?: number;

    @Column({ type: 'varchar', length: 50, default: 'PENDING' })
    commissionStatus!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}

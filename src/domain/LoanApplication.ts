import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

@Entity('loan_applications')
@Index(['borrowerId'])
@Index(['statusId'])
@Index(['createdAt'])
export class LoanApplication {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: number;

    @Column({ type: 'bigint' })
    borrowerId!: number; // References users.id


    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount!: number;

    @Column({ type: 'int' })
    durationMonths!: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    purpose?: string;

    @Column({ type: 'int' })
    statusId!: number; // References loan_application_statuses

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    fundedPercent!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'funded_amount' })
    fundedAmount!: number;

    @Column({ type: 'varchar', length: 20, nullable: true, name: 'commission_status' })
    commissionStatus?: string; // PENDING | PAID | WAIVED

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'voluntary_commission' })
    voluntaryCommission!: number;

    @Column({ type: 'varchar', length: 20, default: 'LUMP_SUM', name: 'repayment_type' })
    repaymentType!: string; // LUMP_SUM | INSTALLMENTS

    @Column({ type: 'text', nullable: true })
    description?: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}

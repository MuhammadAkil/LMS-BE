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

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}

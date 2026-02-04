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
export class LoanOffer {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: number;

    @Column({ type: 'bigint' })
    loanId!: number;

    @Column({ type: 'bigint' })
    lenderId!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount!: number;

    @CreateDateColumn()
    createdAt!: Date;
}

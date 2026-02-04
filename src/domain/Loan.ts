import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';

@Entity('loans')
@Index(['borrowerId', 'statusId'])
@Index(['applicationId'])
@Index(['statusId'])
export class Loan {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: number;

    @Column({ type: 'bigint' })
    applicationId!: number;

    @Column({ type: 'bigint' })
    borrowerId!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    totalAmount!: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    fundedAmount!: number;

    @Column({ type: 'int' })
    statusId!: number;

    @Column({ type: 'date', nullable: true })
    dueDate?: Date;

    @CreateDateColumn()
    createdAt!: Date;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('loans')
@Index(['applicationId'])
@Index(['borrowerId'])
@Index(['statusId'])
@Index(['dueDate'])
export class Loan {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  applicationId!: number; // References loan_applications.id

  @Column({ type: 'bigint' })
  borrowerId!: number; // References users.id

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fundedAmount!: number;

  @Column({ type: 'int' })
  statusId!: number; // References loan_statuses

  @Column({ type: 'date' })
  dueDate!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

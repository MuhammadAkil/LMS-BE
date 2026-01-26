import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('verifications')
@Index(['userId', 'statusId'])
@Index(['statusId'])
export class Verification {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  userId!: number;

  @Column({ type: 'int' })
  typeId!: number; // References verification_types

  @Column({ type: 'int' })
  statusId!: number; // References verification_statuses

  @Column({ type: 'datetime' })
  submittedAt!: Date;

  @Column({ type: 'bigint', nullable: true })
  reviewedBy?: number; // References users.id

  @Column({ type: 'datetime', nullable: true })
  reviewedAt?: Date;

  @Column({ type: 'longtext', nullable: true })
  reviewComment?: string;

  @Column({ type: 'longtext', nullable: true })
  metadata?: string; // JSON string of verification details

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

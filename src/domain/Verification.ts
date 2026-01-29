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

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: number;

  @Column({ type: 'int', name: 'type_id' })
  typeId!: number; // References verification_types

  @Column({ type: 'int', name: 'status_id' })
  statusId!: number; // References verification_statuses

  @Column({ type: 'datetime' })
  submittedAt!: Date;

  @Column({ type: 'bigint', nullable: true, name: 'reviewed_by' })
  reviewedBy?: number; // References users.id

  @Column({ type: 'datetime', nullable: true, name: 'reviewed_at' })
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

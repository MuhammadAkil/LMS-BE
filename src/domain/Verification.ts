import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_verifications')
@Index(['userId', 'statusId'])
@Index(['statusId'])
export class Verification {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: number;

  @Column({ type: 'int', name: 'verification_type_id' })
  typeId!: number;

  @Column({ type: 'int', name: 'status_id' })
  statusId!: number;

  @Column({ type: 'datetime', name: 'created_at' })
  submittedAt!: Date;

  @Column({ type: 'bigint', nullable: true, name: 'reviewed_by' })
  reviewedBy?: number;

  @Column({ type: 'datetime', nullable: true, name: 'reviewed_at' })
  reviewedAt?: Date;

  @Column({ type: 'text', nullable: true, name: 'review_comment' })
  reviewComment?: string;

  @Column({ type: 'json', nullable: true, name: 'metadata' })
  metadata?: Record<string, any>;
}

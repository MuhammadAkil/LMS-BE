import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './User';

@Entity('audit_logs')
@Index(['userId', 'createdAt'])
@Index(['entity', 'entityId'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint', name: 'user_id' })
  userId!: number;

  @Column({ type: 'varchar', length: 255 })
  action!: string; // e.g., USER_STATUS_CHANGED, VERIFICATION_APPROVED

  @Column({ type: 'varchar', length: 100 })
  entity!: string; // e.g., USER, VERIFICATION, COMPANY

  @Column({ type: 'bigint', name: 'entity_id' })
  entityId!: number;

  @Column({ type: 'longtext', nullable: true })
  metadata?: string; // JSON string of changes

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip?: string; // Client IP for GDPR/compliance

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  actor?: User;
}

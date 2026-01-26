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
@Index(['actorId', 'createdAt'])
@Index(['entity', 'entityId'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  actorId!: number;

  @Column({ type: 'varchar', length: 100 })
  action!: string; // e.g., USER_STATUS_CHANGED, VERIFICATION_APPROVED

  @Column({ type: 'varchar', length: 100 })
  entity!: string; // e.g., USER, VERIFICATION, COMPANY

  @Column({ type: 'bigint' })
  entityId!: number;

  @Column({ type: 'longtext', nullable: true })
  metadata?: string; // JSON string of changes

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actorId' })
  actor?: User;
}

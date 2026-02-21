import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('approval_workflow_logs')
@Index(['entityType', 'entityId'])
export class ApprovalWorkflowLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 100, name: 'entity_type' })
  entityType!: string; // COMMISSION_CONFIG | TEMPLATE | MANAGEMENT_COMMISSION | FILE_CONFIG

  @Column({ type: 'bigint', name: 'entity_id' })
  entityId!: number;

  @Column({ type: 'varchar', length: 50, name: 'from_status' })
  fromStatus!: string;

  @Column({ type: 'varchar', length: 50, name: 'to_status' })
  toStatus!: string;

  @Column({ type: 'int', name: 'actor_id' })
  actorId!: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

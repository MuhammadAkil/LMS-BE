import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('companies')
@Index(['statusId'])
export class Company {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  bankAccount?: string;

  @Column({ type: 'int', name: 'status_id' })
  statusId!: number; // References user_statuses

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, name: 'commission_pct' })
  commissionPct!: number; // Commission percentage (0-100)

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'min_managed_amount' })
  minManagedAmount!: number; // Minimum managed amount in base currency

  @Column({ type: 'json', nullable: true })
  metadata?: any; // Flexible metadata storage

  @Column({ type: 'json', nullable: true, name: 'conditions_json' })
  conditionsJson?: any; // Storing as JSON

  /**
   * Persisted auto-bid configuration for the marketplace automation screen.
   * Stores the full CompanyAutoBidConfig JSON blob.
   */
  @Column({ type: 'json', nullable: true, name: 'auto_bid_config' })
  autoBidConfig?: any;

  @Column({ type: 'datetime', nullable: true, name: 'approved_at' })
  approvedAt?: Date;

  @Column({ type: 'datetime', nullable: true, name: 'conditions_locked_at' })
  conditionsLockedAt?: Date; // Set when admin approves; locks conditions from further edits

  /** not_submitted | pending_approval | approved | revision_required */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'conditions_status' })
  conditionsStatus?: string;

  @Column({ type: 'text', nullable: true, name: 'admin_revision_note' })
  adminRevisionNote?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

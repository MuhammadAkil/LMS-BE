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

  @Column({ type: 'int', name: 'status_id' })
  statusId!: number; // References user_statuses

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  commissionPct!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  minManagedAmount!: number;

  @Column({ type: 'longtext', nullable: true })
  metadata?: string; // JSON string

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

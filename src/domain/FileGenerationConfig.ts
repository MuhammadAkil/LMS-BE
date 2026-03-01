import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('file_generation_configs')
export class FileGenerationConfig {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 10, name: 'file_format' })
  fileFormat!: string; // XML | CSV

  @Column({ type: 'varchar', length: 100, name: 'entity_type' })
  entityType!: string; // LOAN | REPAYMENT | USER | PAYMENT

  @Column({ type: 'json', name: 'field_config' })
  fieldConfig!: any; // array of { field, label, transform? }

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status!: string; // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED

  @Column({ type: 'int', name: 'created_by' })
  createdBy!: number;

  @Column({ type: 'int', nullable: true, name: 'approved_by' })
  approvedBy?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

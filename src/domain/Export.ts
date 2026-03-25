import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('exports')
@Index(['typeId', 'createdAt'])
@Index(['createdBy', 'createdAt'])
export class Export {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'int', name: 'export_type_id' })
  typeId!: number;

  @Column({ type: 'bigint', name: 'created_by' })
  createdBy!: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'file_path' })
  filePath?: string;

  @Column({ type: 'int', nullable: true, name: 'record_count' })
  recordCount?: number;

  @Column({ type: 'text', nullable: true, name: 'metadata' })
  metadata?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

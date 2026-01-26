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

  @Column({ type: 'int' })
  typeId!: number; // References export_types (XML, CSV, LAWSUITS)

  @Column({ type: 'bigint' })
  createdBy!: number; // References users.id

  @Column({ type: 'longtext', nullable: true })
  filePath?: string; // S3 or local file path

  @Column({ type: 'int', default: 0 })
  recordCount!: number; // Number of records exported

  @Column({ type: 'longtext', nullable: true })
  metadata?: string; // JSON string (filters, status, etc)

  @CreateDateColumn()
  createdAt!: Date;
}

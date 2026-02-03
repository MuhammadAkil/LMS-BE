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
  typeId!: number; // References export_types (XML, CSV, LAWSUITS)

  @Column({ type: 'bigint', name: 'created_by' })
  createdBy!: number; // References users.id

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'file_path' })
  filePath?: string; // S3 or local file path

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

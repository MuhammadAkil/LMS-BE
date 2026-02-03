import {
  Entity,
  Column,
  PrimaryColumn,
} from 'typeorm';

@Entity('export_types')
export class ExportType {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name?: string;
}

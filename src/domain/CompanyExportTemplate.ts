import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('company_export_templates')
@Index(['companyId'])
export class CompanyExportTemplate {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint', name: 'company_id' })
  companyId!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** JSON array of field keys e.g. ["loanId","loanAmount","status"] */
  @Column({ type: 'json', name: 'field_keys' })
  fieldKeys!: string[];

  @Column({ type: 'bigint', name: 'created_by' })
  createdBy!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

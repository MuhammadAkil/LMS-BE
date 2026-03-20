import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('management_agreements')
@Index(['lenderId'])
@Index(['companyId'])
export class ManagementAgreement {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  lenderId!: number; // References users.id

  @Column({ type: 'bigint' })
  companyId!: number; // References companies.id

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount?: number;

  @Column({ type: 'datetime', nullable: true })
  signedAt?: Date;

  @Column({ type: 'datetime', nullable: true, name: 'lender_signed_at' })
  lenderSignedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'lender_signer_name' })
  lenderSignerName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'lender_signer_role' })
  lenderSignerRole?: string;

  @Column({ type: 'text', nullable: true, name: 'lender_signature_data' })
  lenderSignatureData?: string;

  @Column({ type: 'datetime', nullable: true, name: 'company_signed_at' })
  companySignedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'company_signer_name' })
  companySignerName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'company_signer_role' })
  companySignerRole?: string;

  @Column({ type: 'text', nullable: true, name: 'company_signature_data' })
  companySignatureData?: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'signed_document_path' })
  signedDocumentPath?: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'document_key' })
  documentKey?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true, name: 'document_url' })
  documentUrl?: string;

  @Column({ type: 'datetime', nullable: true, name: 'terminated_at' })
  terminatedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

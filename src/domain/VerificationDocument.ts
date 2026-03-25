import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('verification_documents')
@Index(['verificationId'])
export class VerificationDocument {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  verificationId!: number; // References user_verifications.id

  @Column({ type: 'varchar', length: 255, nullable: true })
  filePath?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType?: string;

  @Column({ type: 'bigint', nullable: true })
  size?: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  category?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  subtype?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  side?: string;

  @Column({ type: 'datetime', nullable: true })
  issuedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fullName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  addressLine?: string;

  @CreateDateColumn()
  uploadedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  deletedAt?: Date;
}

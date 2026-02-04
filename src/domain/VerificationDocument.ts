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

  @CreateDateColumn()
  uploadedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  deletedAt?: Date;
}

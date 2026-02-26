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

  @Column({ type: 'datetime', nullable: true, name: 'terminated_at' })
  terminatedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

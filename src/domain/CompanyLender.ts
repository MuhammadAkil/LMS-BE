import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('company_lenders')
@Index(['companyId'])
@Index(['lenderId'])
export class CompanyLender {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  companyId!: number; // References companies.id

  @Column({ type: 'bigint' })
  lenderId!: number; // References users.id

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amountLimit?: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

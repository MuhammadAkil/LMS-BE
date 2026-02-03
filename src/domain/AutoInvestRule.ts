import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('auto_invest_rules')
@Index(['companyId'])
export class AutoInvestRule {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  companyId!: number; // References companies.id

  @Column({ type: 'int' })
  minLevel!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxAmount?: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

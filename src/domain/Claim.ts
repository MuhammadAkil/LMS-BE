import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('claims')
@Index(['loanId'])
@Index(['generatedAt'])
export class Claim {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  loanId!: number; // References loans.id

  @Column({ type: 'varchar', length: 255, nullable: true })
  xmlPath?: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'document_key' })
  documentKey?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true, name: 'document_url' })
  documentUrl?: string;

  @Column({ type: 'datetime' })
  generatedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('contracts')
@Index(['loanId'])
@Index(['generatedAt'])
export class Contract {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  loanId!: number; // References loans.id

  @Column({ type: 'varchar', length: 255, nullable: true })
  pdfPath?: string;

  @Column({ type: 'datetime', nullable: true })
  generatedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

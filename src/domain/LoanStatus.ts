import {
  Entity,
  Column,
  PrimaryColumn,
} from 'typeorm';

@Entity('loan_statuses')
export class LoanStatus {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name?: string;
}

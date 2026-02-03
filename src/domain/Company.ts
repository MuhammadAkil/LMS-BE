import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('companies')
@Index(['statusId'])
export class Company {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  bankAccount?: string;

  @Column({ type: 'int', name: 'status_id' })
  statusId!: number; // References user_statuses

  @Column({ type: 'json', nullable: true, name: 'conditions_json' })
  conditionsJson?: any; // Storing as JSON

  @Column({ type: 'datetime', nullable: true, name: 'approved_at' })
  approvedAt?: Date;
}

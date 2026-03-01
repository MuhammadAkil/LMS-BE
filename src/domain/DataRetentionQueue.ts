import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('data_retention_queue')
@Index(['tableName'])
@Index(['deleteAt'])
export class DataRetentionQueue {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  tableName!: string;

  @Column({ type: 'bigint' })
  recordId!: number;

  @Column({ type: 'datetime' })
  deleteAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

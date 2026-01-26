import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './User';

@Entity('notifications')
@Index(['userId', 'createdAt'])
@Index(['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  userId!: number;

  @Column({ type: 'varchar', length: 100 })
  type!: string; // e.g., USER_BLOCKED, VERIFICATION_REJECTED

  @Column({ type: 'longtext' })
  payload!: string; // JSON string

  @Column({ type: 'boolean', default: false })
  read!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  readAt?: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;
}

import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity('user_sessions')
export class UserSession {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: number;

    @Column({ type: 'bigint' })
    userId!: number;

    @Column({ type: 'varchar', length: 255, unique: true })
    token!: string;

    @Column({ type: 'datetime', nullable: true })
    expiresAt?: Date;

    @CreateDateColumn()
    createdAt!: Date;

    // Relations
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user?: User;
}

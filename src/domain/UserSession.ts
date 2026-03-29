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

    @Column({ type: 'bigint', name: 'user_id' })
    userId!: number;

    @Column({ type: 'varchar', length: 512, unique: true })
    token!: string;

    @Column({ type: 'datetime', nullable: true, name: 'expires_at' })
    expiresAt?: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    // Relations
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user?: User;
}

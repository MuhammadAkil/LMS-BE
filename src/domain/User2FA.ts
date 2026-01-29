import {
    Entity,
    Column,
    PrimaryColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity('user_2fa')
export class User2FA {
    @PrimaryColumn({ type: 'bigint', name: 'user_id' })
    userId!: number;

    @Column({ type: 'boolean', default: false })
    enabled!: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    secret?: string;

    @Column({ type: 'datetime', nullable: true })
    lastVerifiedAt?: Date;

    // Relations
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user?: User;
}

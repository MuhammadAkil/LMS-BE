import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserRole } from './UserRole';
import { UserStatus } from './UserStatus';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: number;

    @Column({ type: 'varchar', length: 255, unique: true })
    email!: string;

    @Column({ type: 'varchar', length: 255 })
    passwordHash!: string;

    @Column({ type: 'int' })
    roleId!: number;

    @Column({ type: 'int' })
    statusId!: number;

    @Column({ type: 'int', default: 0 })
    level!: number;

    @Column({ type: 'varchar', length: 30, nullable: true })
    phone?: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    // Relations
    @ManyToOne(() => UserRole)
    @JoinColumn({ name: 'roleId' })
    role?: UserRole;

    @ManyToOne(() => UserStatus)
    @JoinColumn({ name: 'statusId' })
    status?: UserStatus;
}

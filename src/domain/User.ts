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

    @Column({ type: 'varchar', length: 255, name: 'password_hash' })
    passwordHash!: string;

    @Column({ type: 'int', name: 'role_id' })
    roleId!: number;

    @Column({ type: 'int', name: 'status_id' })
    statusId!: number;

    @Column({ type: 'int', default: 0, name: 'level' })
    level!: number;

    @Column({ type: 'varchar', length: 100, nullable: true, name: 'first_name' })
    firstName?: string;

    @Column({ type: 'varchar', length: 100, nullable: true, name: 'last_name' })
    lastName?: string;

    @Column({ type: 'varchar', length: 30, nullable: true, name: 'phone' })
    phone?: string;

    @Column({ type: 'varchar', length: 34, nullable: true, name: 'bank_account' })
    bankAccount?: string; // IBAN

    @Column({ type: 'varchar', length: 11, nullable: true, name: 'pesel' })
    pesel?: string;

    @Column({ type: 'text', nullable: true, name: 'address' })
    address?: string;

    /**
     * FK to companies.id — set when this user account owns/manages a company.
     * roleId 4 (COMPANY) users must have this populated.
     */
    @Column({ type: 'bigint', nullable: true, name: 'company_id' })
    companyId?: number;

    @Column({ type: 'boolean', default: false, name: 'is_super_admin' })
    isSuperAdmin!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @Column({ type: 'datetime', nullable: true, name: 'deleted_at' })
    deletedAt?: Date; // Soft delete for GDPR; financial data retained 8 years

    // Relations
    @ManyToOne(() => UserRole)
    @JoinColumn({ name: 'role_id' })
    role?: UserRole;

    @ManyToOne(() => UserStatus)
    @JoinColumn({ name: 'status_id' })
    status?: UserStatus;
}

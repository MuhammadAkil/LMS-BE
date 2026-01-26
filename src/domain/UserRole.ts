import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('user_roles')
export class UserRole {
    @PrimaryColumn({ type: 'int' })
    id!: number;

    @Column({ type: 'varchar', length: 50, unique: true })
    code!: string;

    @Column({ type: 'varchar', length: 100 })
    name!: string;
}

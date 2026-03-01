
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('customer_auth_session')
export class CustomerAuthSession {

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'varchar', length: 256, unique: true, name: 'jwt_token' })
  jwtToken!: string;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}

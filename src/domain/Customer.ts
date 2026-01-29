import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export type CustomerStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED';
export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'mobile_number' })
  mobileNumber!: string;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column({ nullable: true })
  cnic?: string;

  @Column({ nullable: true })
  email?: string;

  @Column()
  status!: CustomerStatus;

  @Column({ nullable: true, name: 'risk_tier' })
  riskTier?: RiskTier;

  @Column()
  password!: string;

  @Column({ nullable: true, name: 'external_customer_id' })
  externalCustomerId?: string;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ nullable: true, name: 'date_of_birth' })
  dateOfBirth?: Date;
}

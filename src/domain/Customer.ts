import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export type CustomerStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED';
export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  mobileNumber!: string;

  @Column()
  fullName!: string;

  @Column({ nullable: true })
  cnic?: string;

  @Column({ nullable: true })
  email?: string;

  @Column()
  status!: CustomerStatus;

  @Column({ nullable: true })
  riskTier?: RiskTier;

  @Column()
  password!: string;

  @Column({ nullable: true })
  externalCustomerId?: string;

  @Column()
  createdAt!: Date;

  @Column()
  updatedAt!: Date;

  @Column({ nullable: true})
  dateOfBirth?: Date;
}

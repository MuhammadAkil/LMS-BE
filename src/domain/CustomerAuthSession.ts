import { Entity, Column, ObjectIdColumn, ObjectId } from 'typeorm';

@Entity('customer_auth_session')
export class CustomerAuthSession {
  @ObjectIdColumn({ name: '_id' })
  id!: ObjectId;

  @Column()
  customerId!: string;

  @Column({ length: 256, unique: true })
  jwtToken!: string;

  @Column()
  expiresAt!: Date;

  @Column()
  createdAt!: Date;

  @Column()
  updatedAt!: Date;
}

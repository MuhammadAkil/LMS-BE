import {
  Entity,
  Column,
  PrimaryColumn,
} from 'typeorm';

@Entity('verification_types')
export class VerificationType {
  @PrimaryColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;
}

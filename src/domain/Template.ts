import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('templates')
@Index(['type', 'language'])
export class Template {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  type!: string; // e.g., EMAIL_VERIFICATION, SMS_REMINDER

  @Column({ type: 'varchar', length: 10 })
  language!: string; // PL, EN

  @Column({ type: 'longtext' })
  content!: string; // Template content with placeholders

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject?: string; // For email templates

  @Column({ type: 'boolean', default: false })
  deprecated!: boolean;

  @Column({ type: 'datetime', nullable: true })
  deprecatedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

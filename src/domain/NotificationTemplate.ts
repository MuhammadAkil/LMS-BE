import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * In-app notification templates (MySQL).
 * Used to resolve title/body from template code + payload placeholders.
 */
@Entity('notification_templates')
@Index(['code', 'locale'], { unique: true })
export class NotificationTemplate {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  code!: string; // e.g. APPLICATION_CREATED, VERIFICATION_APPROVED

  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  titleTemplate?: string; // e.g. "Assignment due: {{courseName}} - {{assignmentTitle}}"

  @Column({ type: 'text', nullable: true })
  bodyTemplate?: string; // e.g. "Due by {{dueDate}}"

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

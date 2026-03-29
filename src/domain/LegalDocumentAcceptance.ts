import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
    Index,
} from 'typeorm';
import { LegalDocumentVersion } from './LegalDocumentVersion';

@Entity('legal_document_acceptances')
@Unique(['userId', 'documentVersionId'])
@Index(['userId', 'documentVersionId'])
@Index(['documentVersionId'])
export class LegalDocumentAcceptance {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: number;

    @Column({ type: 'bigint', name: 'user_id' })
    userId!: number;

    @Column({ type: 'int', name: 'document_version_id' })
    documentVersionId!: number;

    @CreateDateColumn({ name: 'accepted_at' })
    acceptedAt!: Date;

    @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
    ipAddress!: string | null;

    @ManyToOne(() => LegalDocumentVersion, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'document_version_id' })
    documentVersion!: LegalDocumentVersion;
}

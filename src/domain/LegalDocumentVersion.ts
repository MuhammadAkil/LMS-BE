import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { LegalDocument } from './LegalDocument';

@Entity('legal_document_versions')
export class LegalDocumentVersion {
    @PrimaryGeneratedColumn({ type: 'int' })
    id!: number;

    @Column({ type: 'int', name: 'document_id' })
    documentId!: number;

    @Column({ type: 'int', name: 'version_number' })
    versionNumber!: number;

    /** Content: inline HTML/text or path to file */
    @Column({ type: 'text', nullable: true })
    content!: string | null;

    /** Optional file path for PDF/document */
    @Column({ type: 'varchar', length: 512, nullable: true, name: 'file_path' })
    filePath!: string | null;

    /** When this version became effective; re-acceptance required for affected users */
    @Column({ type: 'datetime', name: 'effective_from' })
    effectiveFrom!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => LegalDocument, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'document_id' })
    document!: LegalDocument;
}

import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
} from 'typeorm';
import { LegalDocument } from './LegalDocument';

/** User type for assignment: borrower, lender, management company */
export const LEGAL_DOCUMENT_USER_TYPES = ['BORROWER', 'LENDER', 'COMPANY'] as const;
export type LegalDocumentUserType = (typeof LEGAL_DOCUMENT_USER_TYPES)[number];

@Entity('legal_document_assignments')
@Unique(['documentId', 'userType'])
export class LegalDocumentAssignment {
    @PrimaryGeneratedColumn({ type: 'int' })
    id!: number;

    @Column({ type: 'int', name: 'document_id' })
    documentId!: number;

    /** BORROWER | LENDER | COMPANY */
    @Column({ type: 'varchar', length: 32, name: 'user_type' })
    userType!: string;

    /** Whether acceptance is mandatory before user can proceed */
    @Column({ type: 'tinyint', default: 1 })
    mandatory!: number; // 1 = true, 0 = false

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => LegalDocument, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'document_id' })
    document!: LegalDocument;
}

import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

/** Document type code: predefined or CUSTOM for admin-defined */
export const LEGAL_DOCUMENT_TYPE_CODES = [
    'LOAN_AGREEMENT',
    'PRIVACY_POLICY',
    'GDPR_CONSENT',
    'CUSTOM',
] as const;
export type LegalDocumentTypeCode = (typeof LEGAL_DOCUMENT_TYPE_CODES)[number];

@Entity('legal_documents')
export class LegalDocument {
    @PrimaryGeneratedColumn({ type: 'int' })
    id!: number;

    /** Display name/label (admin-defined) */
    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** Type code; use CUSTOM for open-ended admin-defined */
    @Column({ type: 'varchar', length: 64, name: 'type_code' })
    typeCode!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}

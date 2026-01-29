import { AuditLogRepository } from '../repository/AuditLogRepository';
import {
    DocumentListResponse,
    DocumentListItemDto,
    DocumentDetailDto,
} from '../dto/BorrowerDtos';

/**
 * B-07: BORROWER DOCUMENTS CENTER SERVICE
 * Provides document access and management
 *
 * Rules:
 * - Documents from contracts + verification_documents
 * - Access limited to owner
 * - Retention rules enforced (documents auto-expire per platform_configs)
 */
export class BorrowerDocumentsService {
    private auditRepo: AuditLogRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
    }

    /**
     * Get borrower's documents (paginated)
     * Includes: contracts, verification documents, statements, etc.
     *
     * SQL:
     * SELECT
     *   c.id,
     *   'CONTRACT' as type,
     *   CONCAT('Loan ', l.id, ' Contract') as name,
     *   'LOAN' as relatedEntity,
     *   l.id as relatedEntityId,
     *   c.created_at,
     *   DATE_ADD(c.created_at, INTERVAL pc.retention_days DAY) as expiresAt
     * FROM contracts c
     * JOIN loans l ON l.id = c.loan_id
     * CROSS JOIN platform_configs pc WHERE pc.key = 'DOCUMENT_RETENTION_DAYS'
     * WHERE l.borrower_id = ?
     * UNION
     * SELECT
     *   vd.id,
     *   'VERIFICATION' as type,
     *   CONCAT(vt.code, ' Document') as name,
     *   'VERIFICATION' as relatedEntity,
     *   uv.id as relatedEntityId,
     *   vd.created_at,
     *   DATE_ADD(vd.created_at, INTERVAL pc.retention_days DAY) as expiresAt
     * FROM verification_documents vd
     * JOIN user_verifications uv ON uv.id = vd.verification_id
     * JOIN verification_types vt ON vt.id = uv.verification_type_id
     * CROSS JOIN platform_configs pc WHERE pc.key = 'DOCUMENT_RETENTION_DAYS'
     * WHERE uv.user_id = ?
     * ORDER BY created_at DESC
     */
    async getDocumentsPaginated(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<DocumentListResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const offset = (page - 1) * pageSize;

            // TODO: Query contracts + verification_documents
            // TODO: Filter expired documents based on retention rules
            const documents: DocumentListItemDto[] = [];
            const totalItems = 0;

            // Sample data
            documents.push({
                id: 1,
                type: 'CONTRACT',
                name: 'Loan Contract',
                relatedEntity: 'LOAN',
                relatedEntityId: 100,
                createdAt: '2026-01-01',
                downloadUrl: '/api/documents/1/download',
            });

            documents.push({
                id: 2,
                type: 'VERIFICATION',
                name: 'KYC Document',
                relatedEntity: 'VERIFICATION',
                relatedEntityId: 50,
                createdAt: '2025-12-01',
                expiresAt: '2026-03-01',
                downloadUrl: '/api/documents/2/download',
            });

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_DOCUMENTS',
                entity: 'DOCUMENT',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                documents,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
            };
        } catch (error: any) {
            console.error('Error fetching documents:', error);
            throw new Error('Failed to fetch documents');
        }
    }

    /**
     * Get document details
     * Verifies ownership before returning download URL
     */
    async getDocumentDetail(borrowerId: string, documentId: string): Promise<DocumentDetailDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const docIdNum = parseInt(documentId, 10);

            // TODO: Query document
            // TODO: Verify ownership (document belongs to borrower)
            // TODO: Check expiration (if expired and auto-delete enabled, return 404)

            const detail: DocumentDetailDto = {
                id: docIdNum,
                type: 'CONTRACT',
                name: 'Loan Contract',
                relatedEntity: 'LOAN',
                relatedEntityId: 100,
                createdAt: '2026-01-01',
                mimeType: 'application/pdf',
                size: 1024000,
                downloadUrl: '/api/documents/1/download',
            };

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_DOCUMENT_DETAIL',
                entity: 'DOCUMENT',
                entityId: docIdNum,
                createdAt: new Date(),
            } as any);

            return detail;
        } catch (error: any) {
            console.error('Error fetching document detail:', error);
            throw new Error('Failed to fetch document');
        }
    }

    /**
     * Download document
     * Verifies ownership and updates audit log
     * Returns file stream for download
     *
     * Audit action: DOCUMENT_DOWNLOADED
     */
    async downloadDocument(borrowerId: string, documentId: string): Promise<string> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const docIdNum = parseInt(documentId, 10);

            // TODO: Query document
            // TODO: Verify ownership
            // TODO: Get file path/S3 key

            const filePath = '/documents/contracts/loan_100_contract.pdf';

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'DOCUMENT_DOWNLOADED',
                entity: 'DOCUMENT',
                entityId: docIdNum,
                createdAt: new Date(),
            } as any);

            return filePath; // Return file stream or S3 URL
        } catch (error: any) {
            console.error('Error downloading document:', error);
            throw new Error('Failed to download document');
        }
    }
}

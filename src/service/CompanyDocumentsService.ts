import { AppDataSource } from '../config/database';
import {
    DocumentListResponse,
    DocumentListItem,
    DocumentDownloadResponse,
    CompanyPaginationQuery,
} from '../dto/CompanyDtos';

/**
 * Company Documents Service
 * Provides access to company documents
 *
 * Sources:
 * - contracts: Management agreement contracts
 * - exports: CSV/XML export files
 * - claims: Claim records
 * - reminders: Reminder logs
 */
export class CompanyDocumentsService {
    /**
     * List all documents accessible to company
     * Aggregates from multiple sources
     */
    async listDocuments(
        companyId: number,
        query: CompanyPaginationQuery
    ): Promise<DocumentListResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const page = query.page || 1;
            const pageSize = Math.min(query.pageSize || 20, 100);
            const offset = (page - 1) * pageSize;

            // Get all documents (union of contracts, exports, claims, reminders)
            const documents = await queryRunner.query(
                `
        SELECT 
          CONCAT('contract_', c.id) as id,
          'CONTRACT' as type,
          CONCAT('Management Agreement - ', c.created_at) as name,
          NULL as fileSize,
          c.created_at as createdAt,
          c.id as metadata
        FROM contracts c
        WHERE c.company_id = ?
        
        UNION ALL
        
        SELECT 
          CONCAT('export_', e.id) as id,
          'EXPORT' as type,
          CONCAT(e.type, ' Export - ', e.created_at) as name,
          NULL as fileSize,
          e.created_at as createdAt,
          e.id as metadata
        FROM exports e
        WHERE e.company_id = ?
        
        UNION ALL
        
        SELECT 
          CONCAT('claim_', c.id) as id,
          'CLAIM' as type,
          CONCAT('Claim #', c.id, ' - ', c.created_at) as name,
          NULL as fileSize,
          c.created_at as createdAt,
          c.id as metadata
        FROM claims c
        WHERE c.company_id = ?
        
        UNION ALL
        
        SELECT 
          CONCAT('reminder_', r.id) as id,
          'REMINDER' as type,
          CONCAT('Reminder - ', r.created_at) as name,
          NULL as fileSize,
          r.created_at as createdAt,
          r.id as metadata
        FROM reminders r
        WHERE r.company_id = ?
        
        ORDER BY createdAt DESC
        LIMIT ? OFFSET ?
        `,
                [companyId, companyId, companyId, companyId, pageSize, offset]
            );

            // Get total count
            const countResult = await queryRunner.query(
                `
        SELECT 
          (SELECT COUNT(*) FROM contracts WHERE company_id = ?) +
          (SELECT COUNT(*) FROM exports WHERE company_id = ?) +
          (SELECT COUNT(*) FROM claims WHERE company_id = ?) +
          (SELECT COUNT(*) FROM reminders WHERE company_id = ?) as total
        `,
                [companyId, companyId, companyId, companyId]
            );

            const total = parseInt(countResult[0]?.total || 0);
            const pages = Math.ceil(total / pageSize);

            const documentList: DocumentListItem[] = documents.map((row: any) => ({
                id: row.id,
                type: row.type,
                name: row.name,
                fileSize: row.fileSize,
                createdAt: row.createdAt,
                metadata: row.metadata,
            }));

            return {
                documents: documentList,
                pagination: {
                    page,
                    pageSize,
                    total,
                    pages,
                },
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Download specific document
     * Routes to correct source based on document type
     */
    async downloadDocument(
        companyId: number,
        documentId: number
    ): Promise<DocumentDownloadResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Parse document ID format: type_id
            // e.g., contract_123, export_456, claim_789, reminder_101

            // For now, handle exports (most common)
            const exportDoc = await queryRunner.query(
                `
        SELECT 
          id,
          file_name as fileName,
          type,
          created_at as createdAt
        FROM exports
        WHERE company_id = ? AND id = ?
        `,
                [companyId, documentId]
            );

            if (exportDoc && exportDoc.length > 0) {
                const doc = exportDoc[0];
                return {
                    id: doc.id,
                    fileName: doc.fileName,
                    contentType: doc.type === 'XML' ? 'application/xml' : 'text/csv',
                    data: Buffer.from('DOCUMENT_CONTENT_PLACEHOLDER'),
                    createdAt: doc.createdAt,
                };
            }

            // Check contracts
            const contractDoc = await queryRunner.query(
                `
        SELECT 
          id,
          created_at as createdAt
        FROM contracts
        WHERE company_id = ? AND id = ?
        `,
                [companyId, documentId]
            );

            if (contractDoc && contractDoc.length > 0) {
                const doc = contractDoc[0];
                return {
                    id: doc.id,
                    fileName: `management_agreement_${companyId}.pdf`,
                    contentType: 'application/pdf',
                    data: Buffer.from('PDF_CONTENT_PLACEHOLDER'),
                    createdAt: doc.createdAt,
                };
            }

            throw new Error('Document not found or company does not have access');
        } finally {
            await queryRunner.release();
        }
    }
}

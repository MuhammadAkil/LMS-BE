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

            // Get all documents (union of contracts, claims, reminders via loan_offers join)
            const documents = await queryRunner.query(
                `
        SELECT 
          CONCAT('contract_', c.id) as id,
          'CONTRACT' as type,
          CONCAT('Management Agreement - ', c.createdAt) as name,
          NULL as fileSize,
          c.createdAt as createdAt,
          c.id as metadata
        FROM contracts c
        INNER JOIN loan_offers lo ON lo.loanId = c.loanId
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ?
        
        UNION ALL
        
        SELECT 
          CONCAT('claim_', c.id) as id,
          'CLAIM' as type,
          CONCAT('Claim #', c.id, ' - ', c.createdAt) as name,
          NULL as fileSize,
          c.createdAt as createdAt,
          c.id as metadata
        FROM claims c
        INNER JOIN loan_offers lo ON lo.loanId = c.loanId
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ?
        
        UNION ALL
        
        SELECT 
          CONCAT('reminder_', r.id) as id,
          'REMINDER' as type,
          CONCAT('Reminder - ', r.createdAt) as name,
          NULL as fileSize,
          r.createdAt as createdAt,
          r.id as metadata
        FROM reminders r
        INNER JOIN loan_offers lo ON lo.loanId = r.loanId
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ?
        
        ORDER BY createdAt DESC
        LIMIT ? OFFSET ?
        `,
                [companyId, companyId, companyId, pageSize, offset]
            );

            // Get total count
            const countResult = await queryRunner.query(
                `
        SELECT 
          (SELECT COUNT(DISTINCT c.id) FROM contracts c INNER JOIN loan_offers lo ON lo.loanId = c.loanId INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId WHERE cl.companyId = ?) +
          (SELECT COUNT(DISTINCT c.id) FROM claims c INNER JOIN loan_offers lo ON lo.loanId = c.loanId INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId WHERE cl.companyId = ?) +
          (SELECT COUNT(DISTINCT r.id) FROM reminders r INNER JOIN loan_offers lo ON lo.loanId = r.loanId INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId WHERE cl.companyId = ?) as total
        `,
                [companyId, companyId, companyId]
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
          file_path as fileName,
          created_at as createdAt
        FROM exports
        WHERE id = ?
        `,
                [documentId]
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
          createdAt
        FROM contracts
        WHERE id = ?
        `,
                [documentId]
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

import { AppDataSource } from '../config/database';
import {
    DocumentListResponse,
    DocumentListItem,
    DocumentDownloadResponse,
    CompanyPaginationQuery,
} from '../dto/CompanyDtos';
import { basename } from 'node:path';
import { resolveStoredRefForDownload } from '../util/storedFileAccess';

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
          CONCAT('contract_', c.id) as id,
          'CONTRACT' as type,
          CONCAT('Management Agreement - ', c.created_at) as name,
          NULL as fileSize,
          c.created_at as createdAt,
          c.id as metadata
        FROM contracts c
        WHERE c.company_id = ? AND c.contract_type = 'MANAGEMENT_AGREEMENT'

        UNION ALL
        
        SELECT
          CONCAT('export_', e.id) as id,
          'EXPORT' as type,
          CONCAT('Export - ', e.created_at) as name,
          NULL as fileSize,
          e.created_at as createdAt,
          e.id as metadata
        FROM exports e
        WHERE e.metadata LIKE ?
        
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
                [companyId, companyId, `%"companyId":${companyId}%`, companyId, companyId, pageSize, offset]
            );

            // Get total count
            const countResult = await queryRunner.query(
                `
        SELECT 
          (SELECT COUNT(DISTINCT c.id) FROM contracts c INNER JOIN loan_offers lo ON lo.loanId = c.loanId INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId WHERE cl.companyId = ?) +
          (SELECT COUNT(DISTINCT c.id) FROM contracts c WHERE c.company_id = ? AND c.contract_type = 'MANAGEMENT_AGREEMENT') +
          (SELECT COUNT(*) FROM exports e WHERE e.metadata LIKE ?) +
          (SELECT COUNT(DISTINCT c.id) FROM claims c INNER JOIN loan_offers lo ON lo.loanId = c.loanId INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId WHERE cl.companyId = ?) +
          (SELECT COUNT(DISTINCT r.id) FROM reminders r INNER JOIN loan_offers lo ON lo.loanId = r.loanId INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId WHERE cl.companyId = ?) as total
        `,
                [companyId, companyId, `%"companyId":${companyId}%`, companyId, companyId]
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
        documentId: string
    ): Promise<DocumentDownloadResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const rawId = String(documentId);
            const [prefix, idPart] = rawId.includes('_') ? rawId.split('_', 2) : ['export', rawId];
            const numericId = Number(idPart);
            if (!Number.isInteger(numericId) || numericId <= 0) {
                throw new Error('Invalid document ID format');
            }

            if (prefix === 'export') {
                const exportDoc = await queryRunner.query(
                    `
          SELECT 
            id,
            file_path as filePath,
            created_at as createdAt
          FROM exports
          WHERE id = ? AND metadata LIKE ?
          `,
                    [numericId, `%"companyId":${companyId}%`]
                );

                if (!exportDoc || exportDoc.length === 0) {
                    throw new Error('Document not found or company does not have access');
                }

                const doc = exportDoc[0];
                const fp: string = doc.filePath || '';
                const isXml = fp.toLowerCase().endsWith('.xml');
                const resolved = await resolveStoredRefForDownload(fp, 3600);
                if (resolved.mode === 'local') {
                    const fs = await import('node:fs');
                    const data = fs.readFileSync(resolved.path);
                    return {
                        id: `export_${doc.id}`,
                        fileName: fp ? basename(fp) : `export_${doc.id}`,
                        contentType: isXml ? 'application/xml' : 'text/csv',
                        data,
                        createdAt: doc.createdAt,
                    };
                }
                return {
                    id: `export_${doc.id}`,
                    fileName: fp ? basename(fp) : `export_${doc.id}`,
                    contentType: isXml ? 'application/xml' : 'text/csv',
                    createdAt: doc.createdAt,
                    url: resolved.url,
                    expiresIn: 3600,
                };
            }

            if (prefix === 'contract') {
                const contractDoc = await queryRunner.query(
                    `
          SELECT 
            c.id,
            c.createdAt,
            c.pdf_path as pdfPath
          FROM contracts c
          INNER JOIN loan_offers lo ON lo.loanId = c.loanId
          INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
          WHERE c.id = ? AND cl.companyId = ?
          LIMIT 1
          `,
                    [numericId, companyId]
                );

                let contractRow = contractDoc?.[0];
                if (!contractRow) {
                    const mgmtContract = await queryRunner.query(
                        `
            SELECT 
              c.id,
              c.created_at as createdAt,
              c.file_path as pdfPath
            FROM contracts c
            WHERE c.id = ? AND c.company_id = ? AND c.contract_type = 'MANAGEMENT_AGREEMENT'
            LIMIT 1
            `,
                        [numericId, companyId]
                    );
                    contractRow = mgmtContract?.[0];
                }
                if (!contractRow) throw new Error('Document not found or company does not have access');

                const doc = contractRow;
                const fp: string = doc.pdfPath || '';
                if (!fp) {
                    throw new Error('Document file reference missing');
                }
                const resolved = await resolveStoredRefForDownload(fp, 3600);
                if (resolved.mode === 'local') {
                    const fs = await import('node:fs');
                    const data = fs.readFileSync(resolved.path);
                    return {
                        id: `contract_${doc.id}`,
                        fileName: fp ? basename(fp) : `management_agreement_${companyId}.pdf`,
                        contentType: 'application/pdf',
                        data,
                        createdAt: doc.createdAt,
                    };
                }
                return {
                    id: `contract_${doc.id}`,
                    fileName: fp ? basename(fp) : `management_agreement_${companyId}.pdf`,
                    contentType: 'application/pdf',
                    createdAt: doc.createdAt,
                    url: resolved.url,
                    expiresIn: 3600,
                };
            }

            throw new Error('Unsupported document type');
        } finally {
            await queryRunner.release();
        }
    }
}

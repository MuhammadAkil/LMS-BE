import { AppDataSource } from '../config/database';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import {
    DocumentListResponse,
    DocumentListItemDto,
    DocumentDetailDto,
} from '../dto/BorrowerDtos';

/**
 * B-07: BORROWER DOCUMENTS CENTER SERVICE
 * Real implementation querying contracts + verification_documents tables
 */
export class BorrowerDocumentsService {
    private auditRepo: AuditLogRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
    }

    private CONTRACT_OFFSET = 10000; // contract IDs are returned as 10000+contractId

    /**
     * Get borrower's documents (paginated)
     * Sources: contracts table (Loan Agreements) + verification_documents table (KYC/ID docs)
     */
    async getDocumentsPaginated(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<DocumentListResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const db = AppDataSource;

            // Query contracts via loans
            // Note: TypeORM DataSource.query() returns the rows array directly (not [rows, fields])
            const contractRows: any[] = await db.query(
                `SELECT c.id, c.loanId, c.pdfPath, c.createdAt
                 FROM contracts c
                 JOIN loans l ON l.id = c.loanId
                 WHERE l.borrowerId = ?
                 ORDER BY c.createdAt DESC`,
                [borrowerIdNum]
            );

            // Query verification documents
            const verRows: any[] = await db.query(
                `SELECT vd.id, vd.verificationId, vd.filePath, vd.uploadedAt,
                        vt.code as vtCode, uv.status_id as uvStatus
                 FROM verification_documents vd
                 JOIN user_verifications uv ON uv.id = vd.verificationId
                 JOIN verification_types vt ON vt.id = uv.verification_type_id
                 WHERE uv.user_id = ? AND vd.deletedAt IS NULL
                 ORDER BY vd.uploadedAt DESC`,
                [borrowerIdNum]
            );

            const documents: DocumentListItemDto[] = [];

            // Map contracts
            const contracts = Array.isArray(contractRows) ? contractRows : [];
            for (const c of contracts) {
                documents.push({
                    id: this.CONTRACT_OFFSET + Number(c.id),
                    type: 'CONTRACT',
                    name: `Loan #${c.loanId} Agreement`,
                    relatedEntity: 'LOAN',
                    relatedEntityId: Number(c.loanId),
                    createdAt: c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '',
                    downloadUrl: `/api/borrower/documents/${this.CONTRACT_OFFSET + Number(c.id)}/download`,
                    status: 'verified',
                });
            }

            // Map verification documents
            const verDocs = Array.isArray(verRows) ? verRows : [];
            for (const v of verDocs) {
                const statusMap: Record<number, string> = { 1: 'PENDING', 2: 'APPROVED', 3: 'REJECTED' };
                documents.push({
                    id: Number(v.id),
                    type: 'VERIFICATION',
                    name: `${String(v.vtCode || 'ID')} Document`,
                    relatedEntity: 'VERIFICATION',
                    relatedEntityId: Number(v.verificationId),
                    createdAt: v.uploadedAt ? new Date(v.uploadedAt).toISOString().split('T')[0] : '',
                    downloadUrl: `/api/borrower/documents/${v.id}/download`,
                    status: statusMap[v.uvStatus] ?? 'PENDING',
                    filePath: v.filePath,
                });
            }

            const totalItems = documents.length;
            const paginated = documents.slice((page - 1) * pageSize, page * pageSize);

            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_DOCUMENTS',
                entity: 'DOCUMENT',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                documents: paginated,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize) || 1,
                },
            };
        } catch (error: any) {
            console.error('Error fetching documents:', error);
            throw new Error('Failed to fetch documents');
        }
    }

    /**
     * Get document details by encoded ID
     */
    async getDocumentDetail(borrowerId: string, documentId: string): Promise<DocumentDetailDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const docIdNum = parseInt(documentId, 10);
            const db = AppDataSource;

            if (docIdNum >= this.CONTRACT_OFFSET) {
                // Contract
                const contractId = docIdNum - this.CONTRACT_OFFSET;
                const rows: any[] = await db.query(
                    'SELECT c.id, c.loanId, c.pdfPath, c.createdAt FROM contracts c JOIN loans l ON l.id = c.loanId WHERE c.id = ? AND l.borrowerId = ?',
                    [contractId, borrowerIdNum]
                );
                const row = Array.isArray(rows) ? rows[0] : null;
                if (!row) throw new Error('Document not found');
                return {
                    id: docIdNum,
                    type: 'CONTRACT',
                    name: `Loan #${row.loanId} Agreement`,
                    relatedEntity: 'LOAN',
                    relatedEntityId: Number(row.loanId),
                    createdAt: row.createdAt ? new Date(row.createdAt).toISOString().split('T')[0] : '',
                    mimeType: 'application/pdf',
                    size: 0,
                    downloadUrl: row.pdfPath ?? `/api/borrower/documents/${docIdNum}/download`,
                };
            } else {
                // Verification document
                const rows: any[] = await db.query(
                    `SELECT vd.id, vd.filePath, vd.uploadedAt, vt.code as vtCode
                     FROM verification_documents vd
                     JOIN user_verifications uv ON uv.id = vd.verificationId
                     JOIN verification_types vt ON vt.id = uv.verification_type_id
                     WHERE vd.id = ? AND uv.user_id = ? AND vd.deletedAt IS NULL`,
                    [docIdNum, borrowerIdNum]
                );
                const row = Array.isArray(rows) ? rows[0] : null;
                if (!row) throw new Error('Document not found');
                return {
                    id: docIdNum,
                    type: 'VERIFICATION',
                    name: `${String(row.vtCode || 'ID')} Document`,
                    relatedEntity: 'VERIFICATION',
                    relatedEntityId: docIdNum,
                    createdAt: row.uploadedAt ? new Date(row.uploadedAt).toISOString().split('T')[0] : '',
                    mimeType: 'application/pdf',
                    size: 0,
                    downloadUrl: row.filePath ?? `/api/borrower/documents/${docIdNum}/download`,
                };
            }
        } catch (error: any) {
            console.error('Error fetching document detail:', error);
            throw new Error('Failed to fetch document');
        }
    }

    /**
     * Download document  returns file path/URL for the document
     */
    async downloadDocument(borrowerId: string, documentId: string): Promise<string> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const docIdNum = parseInt(documentId, 10);
            const db = AppDataSource;

            let filePath = '';

            if (docIdNum >= this.CONTRACT_OFFSET) {
                const contractId = docIdNum - this.CONTRACT_OFFSET;
                const rows: any[] = await db.query(
                    'SELECT c.pdfPath FROM contracts c JOIN loans l ON l.id = c.loanId WHERE c.id = ? AND l.borrowerId = ?',
                    [contractId, borrowerIdNum]
                );
                const row = Array.isArray(rows) ? rows[0] : null;
                filePath = row?.pdfPath ?? '';
            } else {
                const rows: any[] = await db.query(
                    `SELECT vd.filePath FROM verification_documents vd
                     JOIN user_verifications uv ON uv.id = vd.verificationId
                     WHERE vd.id = ? AND uv.user_id = ? AND vd.deletedAt IS NULL`,
                    [docIdNum, borrowerIdNum]
                );
                const row = Array.isArray(rows) ? rows[0] : null;
                filePath = row?.filePath ?? '';
            }

            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'DOCUMENT_DOWNLOADED',
                entity: 'DOCUMENT',
                entityId: docIdNum,
                createdAt: new Date(),
            } as any);

            return filePath || `/documents/borrower/${borrowerIdNum}/doc_${docIdNum}.pdf`;
        } catch (error: any) {
            console.error('Error downloading document:', error);
            throw new Error('Failed to download document');
        }
    }
}

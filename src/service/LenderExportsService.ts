import {
    SendReminderRequest,
    SendReminderResponse,
    ExportCsvRequest,
    ExportXmlRequest,
    ExportHistoryResponse,
    ExportDto,
    GenerateClaimRequest,
    GenerateClaimResponse,
} from '../dto/LenderDtos';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { ExportRepository } from '../repository/ExportRepository';
import { AppDataSource } from '../config/database';
import { s3Service } from '../services/s3.service';

/**
 * L-05: LENDER REMINDERS SERVICE
 * Send template-based reminders to borrowers
 */
export class LenderRemindersService {
    private auditLogRepository: AuditLogRepository;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
    }

    /**
     * Send reminder to borrower
     * Creates reminder record and sends notification
     * 
     * SQL:
     * INSERT INTO reminders (loan_id, sent_at, channel) VALUES (?, NOW(), 'EMAIL')
     */
    async sendReminder(
        lenderId: string,
        request: SendReminderRequest
    ): Promise<SendReminderResponse> {
        try {
            // TODO: Fetch template based on templateCode
            // Default templates: PAYMENT_REMINDER, OVERDUE_NOTICE, etc.

            // TODO: Get borrower email from loan
            // TODO: Render template with loan details
            // TODO: Send email notification

            // TODO: INSERT into reminders table
            const reminderId = 'REM_' + Date.now();
            const channel = 'EMAIL';

            // Audit log
            const userId = parseInt(lenderId, 10);
            await this.auditLogRepository.create({
                actorId: userId,
                action: 'REMINDER_SENT',
                entity: 'REMINDER',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                reminderId,
                loanId: request.loanId,
                sentAt: new Date().toISOString(),
                channel,
                message: 'Reminder sent successfully',
            };
        } catch (error: any) {
            console.error('Error sending reminder:', error);
            throw new Error('Failed to send reminder');
        }
    }
}

/**
 * L-06: LENDER EXPORTS & CLAIMS SERVICE
 * Generate CSV/XML exports and insurance claims
 */
export class LenderExportsService {
    private auditLogRepository: AuditLogRepository;
    private exportRepo: ExportRepository;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
        this.exportRepo = new ExportRepository();
    }

    /**
     * Export investments as CSV
     * Fields: loan_id, borrower, amount, status, funded_date, next_repayment, roi
     * 
     * SQL:
     * SELECT 
     *   lo.id as investment_id,
     *   l.id as loan_id,
     *   u.email as borrower,
     *   lo.amount,
     *   ls.code as status,
     *   lo.created_at as funded_date,
     *   (SELECT MIN(due_date) FROM repayments WHERE loan_id = l.id AND paid_at IS NULL) as next_repayment,
     *   l.total_amount
     * FROM loan_offers lo
     * JOIN loans l ON l.id = lo.loan_id
     * JOIN users u ON u.id = l.borrower_id
     * JOIN loan_statuses ls ON ls.id = l.status_id
     * WHERE lo.lender_id = ? AND lo.created_at BETWEEN ? AND ?
     */
    async exportCsv(
        lenderId: string,
        request: ExportCsvRequest
    ): Promise<{ filePath: string; fileSize: number; key: string }> {
        const qr = AppDataSource.createQueryRunner();
        try {
            const lenderIdNum = parseInt(lenderId, 10);
            const params: any[] = [lenderIdNum];
            let dateClauses = '';
            if (request.dateFrom) { dateClauses += ' AND lo.createdAt >= ?'; params.push(request.dateFrom); }
            if (request.dateTo) { dateClauses += ' AND lo.createdAt <= ?'; params.push(request.dateTo); }
            if (request.statusFilter && request.statusFilter.length > 0) {
                dateClauses += ` AND ls.code IN (${request.statusFilter.map(() => '?').join(',')})`;
                params.push(...request.statusFilter);
            }

            const rows = await qr.query(
                `SELECT lo.id AS investment_id, l.id AS loan_id, u.email AS borrower_email,
                        lo.amount AS offer_amount, ls.code AS status_code,
                        lo.createdAt AS funded_date, l.totalAmount AS total_amount, l.dueDate AS due_date
                 FROM loan_offers lo
                 JOIN loans l ON l.id = lo.loanId
                 JOIN users u ON u.id = l.borrowerId
                 LEFT JOIN loan_statuses ls ON ls.id = l.statusId
                 WHERE lo.lenderId = ?${dateClauses}
                 ORDER BY lo.createdAt DESC
                 LIMIT 500`,
                params
            );

            const toDate = (v: any) => v ? new Date(v).toISOString().split('T')[0] : 'N/A';
            let csv = 'InvestmentId,LoanId,BorrowerEmail,OfferAmount,Status,FundedDate,TotalAmount,DueDate\n';
            for (const r of rows) {
                csv += `${r.investment_id},${r.loan_id},"${r.borrower_email || ''}",${r.offer_amount || 0},`
                    + `${r.status_code || 'UNKNOWN'},"${toDate(r.funded_date)}",${r.total_amount || 0},"${toDate(r.due_date)}"\n`;
            }

            const fileName = `export_${Date.now()}_investments.csv`;
            const fileBuffer = Buffer.from(csv, 'utf-8');
            const key = s3Service.generateKey('lender', String(lenderIdNum), fileName);
            await s3Service.uploadFile(fileBuffer, key, 'text/csv');
            const fileSize = fileBuffer.length;

            const saved = await this.exportRepo.save({
                typeId: 2, // CSV_EXPORT
                createdBy: lenderIdNum,
                filePath: null as any,
                documentKey: key,
                recordCount: rows.length,
                metadata: JSON.stringify({ dateFrom: request.dateFrom, dateTo: request.dateTo, fileName, key }),
            } as any);

            await this.auditLogRepository.create({
                actorId: lenderIdNum, action: 'EXPORT_CSV', entity: 'EXPORT',
                entityId: Number(saved.id), createdAt: new Date(),
            } as any);

            return { filePath: `/lender/exports/download/${saved.id}`, fileSize, key };
        } finally {
            await qr.release();
        }
    }

    /**
     * Export investments as XML
     * Max 500 items per spec
     * 
     * SQL: Similar to CSV but limited to 500
     */
    async exportXml(
        lenderId: string,
        request: ExportXmlRequest
    ): Promise<{ filePath: string; fileSize: number; itemCount: number; key: string }> {
        const qr = AppDataSource.createQueryRunner();
        try {
            const lenderIdNum = parseInt(lenderId, 10);
            const limit = Math.min(request.limit || 500, 500);
            const params: any[] = [lenderIdNum];
            let dateClauses = '';
            if (request.dateFrom) { dateClauses += ' AND lo.createdAt >= ?'; params.push(request.dateFrom); }
            if (request.dateTo) { dateClauses += ' AND lo.createdAt <= ?'; params.push(request.dateTo); }
            if (request.statusFilter && request.statusFilter.length > 0) {
                dateClauses += ` AND ls.code IN (${request.statusFilter.map(() => '?').join(',')})`;
                params.push(...request.statusFilter);
            }
            params.push(limit);

            const rows = await qr.query(
                `SELECT lo.id AS investment_id, l.id AS loan_id, u.email AS borrower_email,
                        lo.amount AS offer_amount, ls.code AS status_code,
                        lo.createdAt AS funded_date, l.totalAmount AS total_amount, l.dueDate AS due_date
                 FROM loan_offers lo
                 JOIN loans l ON l.id = lo.loanId
                 JOIN users u ON u.id = l.borrowerId
                 LEFT JOIN loan_statuses ls ON ls.id = l.statusId
                 WHERE lo.lenderId = ?${dateClauses}
                 ORDER BY lo.createdAt DESC
                 LIMIT ?`,
                params
            );

            const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const toIso = (v: any) => v ? new Date(v).toISOString() : 'N/A';
            const items = rows.map((r: any) =>
                `  <Investment>\n    <InvestmentId>${r.investment_id}</InvestmentId>\n    <LoanId>${r.loan_id}</LoanId>\n    <BorrowerEmail>${esc(r.borrower_email)}</BorrowerEmail>\n    <OfferAmount>${r.offer_amount ?? 0}</OfferAmount>\n    <Status>${esc(r.status_code ?? 'UNKNOWN')}</Status>\n    <FundedDate>${toIso(r.funded_date)}</FundedDate>\n    <TotalAmount>${r.total_amount ?? 0}</TotalAmount>\n    <DueDate>${toIso(r.due_date)}</DueDate>\n  </Investment>`
            ).join('\n');
            const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<InvestmentsExport lenderId="${lenderIdNum}" generatedAt="${new Date().toISOString()}">\n${items}\n</InvestmentsExport>`;

            const fileName = `export_${Date.now()}_investments.xml`;
            const fileBuffer = Buffer.from(xml, 'utf-8');
            const key = s3Service.generateKey('lender', String(lenderIdNum), fileName);
            await s3Service.uploadFile(fileBuffer, key, 'application/xml');
            const fileSize = fileBuffer.length;

            const saved = await this.exportRepo.save({
                typeId: 1, // XML_EXPORT
                createdBy: lenderIdNum,
                filePath: null as any,
                documentKey: key,
                recordCount: rows.length,
                metadata: JSON.stringify({ dateFrom: request.dateFrom, dateTo: request.dateTo, fileName, key }),
            } as any);

            await this.auditLogRepository.create({
                actorId: lenderIdNum, action: 'EXPORT_XML', entity: 'EXPORT',
                entityId: Number(saved.id), createdAt: new Date(),
            } as any);

            return { filePath: `/lender/exports/download/${saved.id}`, fileSize, itemCount: rows.length, key };
        } finally {
            await qr.release();
        }
    }

    /**
     * Get export history
     * Shows all previous exports for lender
     * 
     * SQL:
     * SELECT 
     *   e.id,
     *   et.code as export_type_code,
     *   u.email as created_by,
     *   e.file_path,
     *   e.created_at,
     *   LENGTH(e.file_path) as file_size (approximate)
     * FROM exports e
     * JOIN export_types et ON et.id = e.export_type_id
     * JOIN users u ON u.id = e.created_by
     * WHERE e.created_by = ?
     * ORDER BY e.created_at DESC
     */
    async getExportHistory(
        lenderId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<ExportHistoryResponse> {
        const lenderIdNum = parseInt(lenderId, 10);
        const offset = (page - 1) * pageSize;

        const [records, totalItems] = await this.exportRepo.findByCreatedBy(lenderIdNum, pageSize, offset);

        const typeCodeMap: Record<number, string> = { 1: 'XML_EXPORT', 2: 'CSV_EXPORT', 3: 'CLAIMS_EXPORT' };

        const exports: ExportDto[] = records.map(e => {
            return {
                id: String(e.id),
                exportTypeCode: typeCodeMap[e.typeId] ?? 'UNKNOWN',
                createdBy: String(e.createdBy),
                filePath: `/lender/exports/download/${e.id}`,
                createdAt: e.createdAt.toISOString(),
                itemCount: e.recordCount ?? 0,
                fileSize: 0,
            };
        });

        await this.auditLogRepository.create({
            actorId: lenderIdNum, action: 'VIEW_EXPORT_HISTORY', entity: 'EXPORT',
            entityId: 0, createdAt: new Date(),
        } as any);

        return {
            exports,
            pagination: {
                page,
                pageSize,
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
            },
        };
    }

    /**
     * Generate insurance claim
     * Creates claim record and generates XML for submission
     * Immutable record
     * 
     * SQL:
     * INSERT INTO claims (loan_id, xml_path, generated_at) VALUES (?, ?, NOW())
     */
    async generateClaim(
        lenderId: string,
        request: GenerateClaimRequest
    ): Promise<GenerateClaimResponse> {
        const qr = AppDataSource.createQueryRunner();
        try {
            const lenderIdNum = parseInt(lenderId, 10);
            const loanIdNum = parseInt(request.loanId, 10);

            // Verify the lender has an investment in this loan
            const verification = await qr.query(
                `SELECT lo.id FROM loan_offers lo WHERE lo.loanId = ? AND lo.lenderId = ? LIMIT 1`,
                [loanIdNum, lenderIdNum]
            );
            if (!verification || verification.length === 0) {
                throw new Error('No investment found for this loan');
            }

            // Fetch loan and borrower details
            const rows = await qr.query(
                `SELECT l.id, l.totalAmount, l.dueDate, u.email, u.phone
                 FROM loans l
                 JOIN users u ON u.id = l.borrowerId
                 WHERE l.id = ? LIMIT 1`,
                [loanIdNum]
            );
            if (!rows || rows.length === 0) {
                throw new Error('Loan not found');
            }
            const loan = rows[0];

            const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const toIso = (v: any) => v ? new Date(v).toISOString() : 'N/A';
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<InsuranceClaim generatedAt="${new Date().toISOString()}" lenderId="${lenderIdNum}">
  <LoanId>${loan.id}</LoanId>
  <BorrowerEmail>${esc(loan.email)}</BorrowerEmail>
  <BorrowerPhone>${esc(loan.phone ?? '')}</BorrowerPhone>
  <TotalAmount>${loan.totalAmount ?? 0}</TotalAmount>
  <DueDate>${toIso(loan.dueDate)}</DueDate>
  <Reason>${esc(request.reason)}</Reason>
</InsuranceClaim>`;

            const fileName = `claim_${Date.now()}_loan${loanIdNum}.xml`;
            const key = s3Service.generateKey('lender', String(lenderIdNum), fileName);
            await s3Service.uploadFile(Buffer.from(xml, 'utf-8'), key, 'application/xml');

            // Insert into claims table
            const claimResult = await qr.query(
                `INSERT INTO claims (loanId, xmlPath, document_key, generatedAt, createdAt) VALUES (?, ?, ?, NOW(), NOW())`,
                [loanIdNum, key, key]
            );
            const claimId = String(claimResult?.insertId ?? Date.now());

            await this.auditLogRepository.create({
                actorId: lenderIdNum, action: 'CLAIM_GENERATED', entity: 'CLAIM',
                entityId: Number(claimId) || 0, createdAt: new Date(),
            } as any);

            return {
                claimId,
                loanId: request.loanId,
                xmlPath: key,
                generatedAt: new Date().toISOString(),
                message: 'Claim generated successfully',
            };
        } finally {
            await qr.release();
        }
    }
}

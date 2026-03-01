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

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
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
    ): Promise<{ filePath: string; fileSize: number }> {
        try {
            const dateFrom = request.dateFrom || null;
            const dateTo = request.dateTo || null;

            // TODO: Build CSV content from query results
            // TODO: Generate CSV file and store in exports directory
            // TODO: INSERT into exports table with export_type_id for CSV

            const exportId = 'EXP_' + Date.now();
            const filePath = `/exports/${exportId}_investments.csv`;

            // Audit log
            const userId = parseInt(lenderId, 10);
            await this.auditLogRepository.create({
                actorId: userId,
                action: 'EXPORT_CSV',
                entity: 'EXPORT',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                filePath,
                fileSize: 1024, // Placeholder
            };
        } catch (error: any) {
            console.error('Error exporting CSV:', error);
            throw new Error('Failed to export CSV');
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
    ): Promise<{ filePath: string; fileSize: number; itemCount: number }> {
        try {
            const limit = Math.min(request.limit || 500, 500); // Max 500 for XML spec

            // TODO: Build XML from query results (limit 500)
            // TODO: Generate XML file and store
            // TODO: INSERT into exports table

            const exportId = 'EXP_' + Date.now();
            const filePath = `/exports/${exportId}_investments.xml`;
            const itemCount = limit;

            // Audit log
            const userId = parseInt(lenderId, 10);
            await this.auditLogRepository.create({
                actorId: userId,
                action: 'EXPORT_XML',
                entity: 'EXPORT',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                filePath,
                fileSize: 2048, // Placeholder
                itemCount,
            };
        } catch (error: any) {
            console.error('Error exporting XML:', error);
            throw new Error('Failed to export XML');
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
        try {
            const offset = (page - 1) * pageSize;

            // TODO: Query exports for lender

            const exports: ExportDto[] = [];
            const totalItems = 0;

            const userId = parseInt(lenderId, 10);
            await this.auditLogRepository.create({
                actorId: userId,
                action: 'VIEW_EXPORT_HISTORY',
                entity: 'EXPORT',
                entityId: 0,
                createdAt: new Date(),
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
        } catch (error: any) {
            console.error('Error fetching export history:', error);
            throw new Error('Failed to fetch export history');
        }
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
        try {
            // TODO: Verify lender owns investment in this loan
            // TODO: Build claim XML with loan and repayment details
            // TODO: Store XML file
            // TODO: INSERT into claims table (immutable)

            const claimId = 'CLM_' + Date.now();
            const xmlPath = `/claims/${claimId}_claim.xml`;

            // Audit log
            const userId = parseInt(lenderId, 10);
            await this.auditLogRepository.create({
                actorId: userId,
                action: 'CLAIM_GENERATED',
                entity: 'CLAIM',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                claimId,
                loanId: request.loanId,
                xmlPath,
                generatedAt: new Date().toISOString(),
                message: 'Claim generated successfully',
            };
        } catch (error: any) {
            console.error('Error generating claim:', error);
            throw new Error('Failed to generate claim');
        }
    }
}

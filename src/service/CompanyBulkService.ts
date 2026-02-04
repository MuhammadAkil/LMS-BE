import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import {
    BulkRemindersRequest,
    BulkRemindersResponse,
    BulkCsvExportRequest,
    BulkXmlExportRequest,
    BulkClaimsRequest,
    BulkActionResponse,
} from '../dto/CompanyDtos';

/**
 * Company Bulk Service
 * Handles bulk operations: reminders, exports, claims
 *
 * Fintech compliance:
 * - Reminders inserted into reminders table
 * - Exports inserted into exports table with type (CSV, XML)
 * - XML limited to 500 loans (enforced)
 * - Claims only for DEFAULTED loans
 * - All operations audited with BULK_ACTION_EXECUTED
 * - No funds transferred by company
 */
export class CompanyBulkService {
    private auditService: CompanyAuditService;

    constructor() {
        this.auditService = new CompanyAuditService();
    }

    /**
     * Create bulk reminders
     * Inserts reminder records for specified loans
     *
     * Fintech compliance:
     * - Validates company has access to loans via company_lenders
     * - Creates reminder records in reminders table
     * - Audits action with BULK_ACTION_EXECUTED
     */
    async createBulkReminders(
        companyId: number,
        userId: number,
        request: BulkRemindersRequest
    ): Promise<BulkRemindersResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Validate company has access to all loans
            const loanIds = request.loanIds;

            if (loanIds.length === 0) {
                throw new Error('Loan IDs cannot be empty');
            }

            // Verify all loans belong to company's linked lenders
            const loanAccess = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as validCount
        FROM loans l
        INNER JOIN company_lenders cl ON l.lender_id = cl.lender_id
        WHERE cl.company_id = ? AND l.id IN (?)
        `,
                [companyId, loanIds]
            );

            if (loanAccess[0].validCount !== loanIds.length) {
                throw new Error('Company does not have access to all specified loans');
            }

            // Insert reminders
            const insertPromises = loanIds.map(loanId =>
                queryRunner.query(
                    `
          INSERT INTO reminders (
            loan_id,
            company_id,
            reminder_type,
            message,
            status,
            created_at
          ) VALUES (?, ?, ?, ?, 'PENDING', NOW())
          `,
                    [
                        loanId,
                        companyId,
                        request.reminderType || 'EMAIL',
                        request.message,
                    ]
                )
            );

            await Promise.all(insertPromises);

            // Create export record for tracking
            const exportResult = await queryRunner.query(
                `
        INSERT INTO exports (
          company_id,
          type,
          item_count,
          status,
          created_at
        ) VALUES (?, 'REMINDERS', ?, 'COMPLETED', NOW())
        `,
                [companyId, loanIds.length]
            );

            const exportId = exportResult.insertId;

            // Audit the bulk action
            await this.auditService.logAction(
                userId,
                'BULK_ACTION_EXECUTED',
                'BULK_REMINDERS',
                exportId,
                {
                    companyId,
                    itemCount: loanIds.length,
                    reminderType: request.reminderType,
                }
            );

            return {
                reminderCount: loanIds.length,
                insertedAt: new Date(),
                exportId,
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Export loans as CSV
     * Creates exports record for CSV download
     */
    async exportCsv(
        companyId: number,
        userId: number,
        request: BulkCsvExportRequest
    ): Promise<BulkActionResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const loanIds = request.loanIds;

            if (loanIds.length === 0) {
                throw new Error('Loan IDs cannot be empty');
            }

            // Validate access
            const access = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as validCount
        FROM loans l
        INNER JOIN company_lenders cl ON l.lender_id = cl.lender_id
        WHERE cl.company_id = ? AND l.id IN (?)
        `,
                [companyId, loanIds]
            );

            if (access[0].validCount !== loanIds.length) {
                throw new Error('Company does not have access to all specified loans');
            }

            // Create export record
            const exportResult = await queryRunner.query(
                `
        INSERT INTO exports (
          company_id,
          type,
          item_count,
          status,
          file_name,
          created_at
        ) VALUES (?, 'CSV', ?, 'PENDING', ?, NOW())
        `,
                [
                    companyId,
                    loanIds.length,
                    request.fileName || `loans_export_${Date.now()}.csv`,
                ]
            );

            const exportId = exportResult.insertId;

            // Audit the export
            await this.auditService.logAction(
                userId,
                'BULK_ACTION_EXECUTED',
                'CSV_EXPORT',
                exportId,
                {
                    companyId,
                    itemCount: loanIds.length,
                    fileName: request.fileName,
                }
            );

            // Notify user
            await this.auditService.notifyUser(userId, 'EXPORT_CREATED', {
                exportId,
                type: 'CSV',
                itemCount: loanIds.length,
                message: 'CSV export has been created',
                timestamp: new Date(),
            });

            return {
                exportId,
                type: 'CSV',
                itemCount: loanIds.length,
                status: 'PENDING',
                downloadUrl: `/api/company/documents/${exportId}/download`,
                createdAt: new Date(),
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Export loans as XML
     * Fintech compliance: Limited to 500 items
     * Guard ensures this, but we validate again here
     */
    async exportXml(
        companyId: number,
        userId: number,
        request: BulkXmlExportRequest
    ): Promise<BulkActionResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const loanIds = request.loanIds;

            // Double-check limit (guard should have caught this)
            if (loanIds.length > 500) {
                throw new Error('XML export limited to 500 loans per request');
            }

            if (loanIds.length === 0) {
                throw new Error('Loan IDs cannot be empty');
            }

            // Validate access
            const access = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as validCount
        FROM loans l
        INNER JOIN company_lenders cl ON l.lender_id = cl.lender_id
        WHERE cl.company_id = ? AND l.id IN (?)
        `,
                [companyId, loanIds]
            );

            if (access[0].validCount !== loanIds.length) {
                throw new Error('Company does not have access to all specified loans');
            }

            // Create export record
            const exportResult = await queryRunner.query(
                `
        INSERT INTO exports (
          company_id,
          type,
          item_count,
          status,
          file_name,
          created_at
        ) VALUES (?, 'XML', ?, 'PENDING', ?, NOW())
        `,
                [
                    companyId,
                    loanIds.length,
                    `loans_export_${Date.now()}.xml`,
                ]
            );

            const exportId = exportResult.insertId;

            // Audit the export
            await this.auditService.logAction(
                userId,
                'BULK_ACTION_EXECUTED',
                'XML_EXPORT',
                exportId,
                {
                    companyId,
                    itemCount: loanIds.length,
                }
            );

            // Notify user
            await this.auditService.notifyUser(userId, 'EXPORT_CREATED', {
                exportId,
                type: 'XML',
                itemCount: loanIds.length,
                message: 'XML export has been created',
                timestamp: new Date(),
            });

            return {
                exportId,
                type: 'XML',
                itemCount: loanIds.length,
                status: 'PENDING',
                downloadUrl: `/api/company/documents/${exportId}/download`,
                createdAt: new Date(),
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Create bulk claims
     * Fintech compliance:
     * - Claims only for DEFAULTED loans (status_id = DEFAULTED)
     * - Validates company access
     * - Inserts into claims table
     */
    async createBulkClaims(
        companyId: number,
        userId: number,
        request: BulkClaimsRequest
    ): Promise<BulkActionResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const loanIds = request.loanIds;

            if (loanIds.length === 0) {
                throw new Error('Loan IDs cannot be empty');
            }

            // Validate company access AND all loans are DEFAULTED
            const defaultedLoans = await queryRunner.query(
                `
        SELECT COUNT(DISTINCT l.id) as count
        FROM loans l
        INNER JOIN company_lenders cl ON l.lender_id = cl.lender_id
        WHERE cl.company_id = ? AND l.id IN (?) AND l.status_id = 3
        `,
                [companyId, loanIds]
            );

            if (defaultedLoans[0].count !== loanIds.length) {
                throw new Error('All loans must be in DEFAULTED status to create claims');
            }

            // Insert claims
            const insertPromises = loanIds.map(loanId =>
                queryRunner.query(
                    `
          INSERT INTO claims (
            loan_id,
            company_id,
            claim_type,
            reason,
            status,
            created_at
          ) VALUES (?, ?, ?, ?, 'PENDING', NOW())
          `,
                    [
                        loanId,
                        companyId,
                        request.claimType || 'DEFAULT',
                        request.reason,
                    ]
                )
            );

            await Promise.all(insertPromises);

            // Create export record for tracking
            const exportResult = await queryRunner.query(
                `
        INSERT INTO exports (
          company_id,
          type,
          item_count,
          status,
          created_at
        ) VALUES (?, 'CLAIMS', ?, 'COMPLETED', NOW())
        `,
                [companyId, loanIds.length]
            );

            const exportId = exportResult.insertId;

            // Audit the bulk action
            await this.auditService.logAction(
                userId,
                'BULK_ACTION_EXECUTED',
                'BULK_CLAIMS',
                exportId,
                {
                    companyId,
                    itemCount: loanIds.length,
                    reason: request.reason,
                }
            );

            // Notify admins
            const adminUsers = await queryRunner.query(
                `
        SELECT id FROM users WHERE role_id = 1 LIMIT 10
        `
            );

            if (adminUsers.length > 0) {
                await this.auditService.notifyMultiple(
                    adminUsers.map((u: any) => u.id),
                    'BULK_CLAIMS_CREATED',
                    {
                        companyId,
                        itemCount: loanIds.length,
                        reason: request.reason,
                        message: `Company created ${loanIds.length} claims for defaulted loans`,
                        timestamp: new Date(),
                    }
                );
            }

            return {
                exportId,
                type: 'CLAIMS',
                itemCount: loanIds.length,
                status: 'COMPLETED',
                createdAt: new Date(),
            };
        } finally {
            await queryRunner.release();
        }
    }
}

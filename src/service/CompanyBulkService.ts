import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import { s3Service } from '../services/s3.service';
import { CompanyReportsService } from './CompanyReportsService';
import { CompanyExportTemplateService } from './CompanyExportTemplateService';
import { ExportRepository } from '../repository/ExportRepository';
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
    private reportsService: CompanyReportsService;
    private templateService: CompanyExportTemplateService;
    private exportRepo: ExportRepository;

    constructor() {
        this.auditService = new CompanyAuditService();
        this.reportsService = new CompanyReportsService();
        this.templateService = new CompanyExportTemplateService();
        this.exportRepo = new ExportRepository();
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
        INNER JOIN loan_offers lo ON lo.loanId = l.id
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ? AND l.id IN (?)
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
            loanId,
            channel,
            sentAt,
            createdAt
          ) VALUES (?, ?, NOW(), NOW())
          `,
                    [
                        loanId,
                        request.reminderType || 'EMAIL',
                    ]
                )
            );

            await Promise.all(insertPromises);

            const exportId = 0; // reminders don't create an exports record

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
        INNER JOIN loan_offers lo ON lo.loanId = l.id
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ? AND l.id IN (?)
        `,
                [companyId, loanIds]
            );

            if (access[0].validCount !== loanIds.length) {
                throw new Error('Company does not have access to all specified loans');
            }

            // Create export record (export_type_id=1 for CSV)
            const exportResult = await queryRunner.query(
                `
        INSERT INTO exports (
          export_type_id,
          created_by,
          record_count,
          created_at
        ) VALUES (1, ?, ?, NOW())
        `,
                [
                    userId,
                    loanIds.length,
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

            await this.auditService.notifyUser(userId, 'EXPORT_CREATED', {
                title: 'Export created',
                message: 'CSV export has been created',
                exportId,
                type: 'CSV',
                itemCount: loanIds.length,
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
     * Export loans as XML with optional field selection or template.
     * Generates file, saves export record with file_path and metadata for company document download.
     * Fintech compliance: Limited to 500 items
     */
    async exportXml(
        companyId: number,
        userId: number,
        request: BulkXmlExportRequest
    ): Promise<BulkActionResponse> {
        const loanIds = request.loanIds;

        if (loanIds.length > 500) throw new Error('XML export limited to 500 loans per request');
        if (loanIds.length === 0) throw new Error('Loan IDs cannot be empty');

        const { rows, commissionRate } = await this.reportsService.getLoanRowsForExport(companyId, {
            loanIds,
        });
        if (rows.length === 0) throw new Error('No accessible loans found for the given IDs');
        const accessibleIds = new Set(rows.map((r: any) => r.id));
        const missing = loanIds.filter((id) => !accessibleIds.has(id));
        if (missing.length) throw new Error('Company does not have access to all specified loans');

        const effectiveFields = await this.templateService.resolveFieldKeys(
            companyId,
            request.templateId,
            request.fields
        );
        const xml = this.reportsService.buildPortfolioXml(rows, commissionRate, effectiveFields, companyId);

        const fileName = `export_${Date.now()}_company${companyId}_bulk.xml`;
        const key = s3Service.generateKey('company', String(companyId), fileName);
        await s3Service.uploadFile(Buffer.from(xml, 'utf-8'), key, 'application/xml');

        const saved = await this.exportRepo.save({
            typeId: 2, // XML
            createdBy: userId,
            filePath: key,
            recordCount: rows.length,
            metadata: JSON.stringify({ companyId, fileName }),
        } as any);
        const exportId = Number(saved.id);

        await this.auditService.logAction(userId, 'BULK_ACTION_EXECUTED', 'XML_EXPORT', exportId, {
            companyId,
            itemCount: rows.length,
        });

        await this.auditService.notifyUser(userId, 'EXPORT_CREATED', {
            title: 'Export created',
            message: 'XML export has been created',
            exportId,
            type: 'XML',
            itemCount: rows.length,
            timestamp: new Date(),
        });

        return {
            exportId,
            type: 'XML',
            itemCount: rows.length,
            status: 'COMPLETED',
            downloadUrl: `/api/company/documents/${exportId}/download`,
            createdAt: new Date(),
        };
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
        INNER JOIN loan_offers lo ON lo.loanId = l.id
        INNER JOIN company_lenders cl ON cl.lenderId = lo.lenderId
        WHERE cl.companyId = ? AND l.id IN (?) AND l.statusId = 3
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
            loanId,
            generatedAt,
            createdAt
          ) VALUES (?, NOW(), NOW())
          `,
                    [loanId]
                )
            );

            await Promise.all(insertPromises);

            const exportId = 0; // claims don't create a separate exports record

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
                        title: 'Bulk claims created',
                        message: `Company created ${loanIds.length} claims for defaulted loans`,
                        companyId,
                        itemCount: loanIds.length,
                        reason: request.reason,
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

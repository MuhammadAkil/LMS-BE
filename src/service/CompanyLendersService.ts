import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import {
    CompanyLenderResponse,
    LinkLenderRequest,
    UpdateLenderRequest,
} from '../dto/CompanyDtos';

/**
 * Company Lenders Service
 * Manages company_lenders relationship
 *
 * Fintech compliance:
 * - Links lenders to companies with amount limits
 * - amount_limit enforced at transaction level
 * - active flag toggles lender relationship
 * - Changes require audit log and notification
 */
export class CompanyLendersService {
    private auditService: CompanyAuditService;

    constructor() {
        this.auditService = new CompanyAuditService();
    }

    /**
     * Get all linked lenders for company
     */
    async getLenders(companyId: number): Promise<CompanyLenderResponse[]> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const lenders = await queryRunner.query(
                `
        SELECT 
          cl.id,
          cl.company_id as companyId,
          cl.lender_id as lenderId,
          u.email as lenderEmail,
          COALESCE(NULLIF(TRIM(u.name), ''), CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')), u.email) as lenderName,
          cl.amount_limit as amountLimit,
          cl.active,
          cl.created_at as createdAt,
          cl.updated_at as updatedAt,
          ma.signed_at as agreementSignedAt,
          ma.terminated_at as agreementTerminatedAt
        FROM company_lenders cl
        INNER JOIN users u ON cl.lender_id = u.id
        LEFT JOIN management_agreements ma ON ma.lender_id = cl.lender_id AND ma.company_id = cl.company_id
        WHERE cl.company_id = ?
        ORDER BY cl.updated_at DESC
        `,
                [companyId]
            );

            return lenders.map((row: any) => {
                let agreementStatus: 'pending' | 'active' | 'terminated' = 'pending';
                if (row.agreementTerminatedAt) agreementStatus = 'terminated';
                else if (row.agreementSignedAt) agreementStatus = 'active';
                return {
                    id: row.id,
                    companyId: row.companyId,
                    lenderId: row.lenderId,
                    lenderName: row.lenderName || row.lenderEmail,
                    lenderEmail: row.lenderEmail,
                    amountLimit: parseFloat(row.amountLimit || 0),
                    active: Boolean(row.active),
                    agreementStatus,
                    agreementSignedAt: row.agreementSignedAt,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                };
            });
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Link lender to company
     * Creates company_lenders record with amount limit
     *
     * Fintech compliance:
     * - Validates lender exists and is APPROVED
     * - Sets amount_limit (enforced at transaction level)
     * - Creates audit log: LENDER_LINKED
     * - Triggers notification to lender
     */
    async linkLender(
        companyId: number,
        userId: number,
        request: LinkLenderRequest
    ): Promise<CompanyLenderResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Lender role_id = 3 (LENDER per LoginResponse role map)
            const lender = await queryRunner.query(
                `
        SELECT id, email, first_name, last_name, name, status_id
        FROM users
        WHERE id = ? AND role_id = 3
        `,
                [request.lenderId]
            );

            if (!lender || lender.length === 0) {
                throw new Error('Lender not found or not a valid lender user');
            }

            if (lender[0].status_id !== 2) {
                throw new Error('Lender account is not active');
            }

            // Company min managed amount
            const companyRow = await queryRunner.query(
                `SELECT min_managed_amount FROM companies WHERE id = ?`,
                [companyId]
            );
            const minAmount = companyRow?.[0]?.min_managed_amount != null ? Number(companyRow[0].min_managed_amount) : 0;
            if (request.amountLimit < minAmount) {
                throw new Error(`Managed amount must be at least ${minAmount} PLN`);
            }

            // Check if already linked to this company
            const existing = await queryRunner.query(
                `SELECT id FROM company_lenders WHERE company_id = ? AND lender_id = ?`,
                [companyId, request.lenderId]
            );
            if (existing && existing.length > 0) {
                throw new Error('Lender already linked to this company');
            }

            // Lender cannot be managed by another company (active agreement elsewhere)
            const otherCompany = await queryRunner.query(
                `SELECT ma.id FROM management_agreements ma
                 WHERE ma.lender_id = ? AND ma.signed_at IS NOT NULL AND (ma.terminated_at IS NULL OR ma.terminated_at > NOW())
                 AND ma.company_id != ?`,
                [request.lenderId, companyId]
            );
            if (otherCompany && otherCompany.length > 0) {
                throw new Error('Lender already has an active management agreement with another company');
            }

            // Insert company_lenders record
            const result = await queryRunner.query(
                `
        INSERT INTO company_lenders (
          company_id,
          lender_id,
          amount_limit,
          active,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, NOW(), NOW())
        `,
                [
                    companyId,
                    request.lenderId,
                    request.amountLimit,
                    request.active !== false, // Default true
                ]
            );

            const id = result.insertId;

            // Create audit log
            await this.auditService.logAction(
                userId,
                'LENDER_LINKED',
                'COMPANY_LENDER',
                id,
                {
                    companyId,
                    lenderId: request.lenderId,
                    amountLimit: request.amountLimit,
                    lenderEmail: lender[0].email,
                }
            );

            // Notify lender about linkage
            await this.auditService.notifyUser(request.lenderId, 'COMPANY_LINKED', {
                title: 'Company linked',
                message: 'You have been linked to a new company',
                companyId,
                amountLimit: request.amountLimit,
                timestamp: new Date(),
            });

            // Fetch and return created record
            const created = await this.getLenders(companyId);
            const linked = created.find(l => l.id === id);

            if (!linked) {
                throw new Error('Failed to create lender link');
            }

            return linked;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Update lender settings (amount_limit)
     * Fintech compliance:
     * - Only amount_limit and active flag can be changed
     * - Changes are audited
     */
    async updateLender(
        companyId: number,
        userId: number,
        lenderId: number,
        request: UpdateLenderRequest
    ): Promise<CompanyLenderResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Verify company_lenders relationship exists
            const existing = await queryRunner.query(
                `
        SELECT * FROM company_lenders
        WHERE company_id = ? AND id = ?
        `,
                [companyId, lenderId]
            );

            if (!existing || existing.length === 0) {
                throw new Error('Company lender relationship not found');
            }

            const updateFields = [];
            const updateValues = [];

            if (request.amountLimit !== undefined) {
                updateFields.push('amount_limit = ?');
                updateValues.push(request.amountLimit);
            }

            if (request.active !== undefined) {
                updateFields.push('active = ?');
                updateValues.push(request.active);
            }

            if (updateFields.length === 0) {
                throw new Error('No fields to update');
            }

            updateValues.push(companyId);
            updateValues.push(lenderId);
            updateFields.push('updated_at = NOW()');

            // Update record
            await queryRunner.query(
                `
        UPDATE company_lenders
        SET ${updateFields.join(', ')}
        WHERE company_id = ? AND id = ?
        `,
                updateValues
            );

            // Create audit log
            await this.auditService.logAction(
                userId,
                'LENDER_UPDATED',
                'COMPANY_LENDER',
                lenderId,
                {
                    companyId,
                    changes: request,
                }
            );

            // Fetch and return updated record
            const updated = await this.getLenders(companyId);
            const record = updated.find(l => l.id === lenderId);

            if (!record) {
                throw new Error('Failed to retrieve updated lender');
            }

            return record;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Toggle lender active status
     * Quick operation to enable/disable lender
     */
    async toggleLenderStatus(
        companyId: number,
        userId: number,
        lenderId: number,
        active: boolean
    ): Promise<CompanyLenderResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Verify company_lenders relationship exists
            const existing = await queryRunner.query(
                `
        SELECT lender_id FROM company_lenders
        WHERE company_id = ? AND id = ?
        `,
                [companyId, lenderId]
            );

            if (!existing || existing.length === 0) {
                throw new Error('Company lender relationship not found');
            }

            // Update active flag
            await queryRunner.query(
                `
        UPDATE company_lenders
        SET active = ?, updated_at = NOW()
        WHERE company_id = ? AND id = ?
        `,
                [active, companyId, lenderId]
            );

            // Create audit log
            await this.auditService.logAction(
                userId,
                'LENDER_TOGGLED',
                'COMPANY_LENDER',
                lenderId,
                {
                    companyId,
                    active,
                }
            );

            // Fetch and return updated record
            const updated = await this.getLenders(companyId);
            const record = updated.find(l => l.id === lenderId);

            if (!record) {
                throw new Error('Failed to retrieve updated lender');
            }

            return record;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Terminate agreement with lender. Stops future automation, marks agreement terminated, notifies lender.
     * In-flight funded loans are not cancelled.
     */
    async terminateLender(companyId: number, userId: number, linkId: number): Promise<void> {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const row = await queryRunner.query(
                `SELECT lender_id FROM company_lenders WHERE company_id = ? AND id = ?`,
                [companyId, linkId]
            );
            if (!row || row.length === 0) throw new Error('Company lender link not found');
            const lenderId = row[0].lender_id;
            await queryRunner.query(
                `UPDATE management_agreements SET terminated_at = NOW() WHERE company_id = ? AND lender_id = ?`,
                [companyId, lenderId]
            );
            await queryRunner.query(
                `UPDATE company_lenders SET active = 0, updated_at = NOW() WHERE company_id = ? AND id = ?`,
                [companyId, linkId]
            );
            await this.auditService.logAction(userId, 'LENDER_AGREEMENT_TERMINATED', 'COMPANY_LENDER', linkId, { companyId, lenderId });
            await this.auditService.notifyUser(lenderId, 'MANAGEMENT_AGREEMENT_TERMINATED', {
                title: 'Management agreement terminated',
                message: 'Your management agreement with the company has been terminated.',
                companyId,
                timestamp: new Date(),
            });
        } finally {
            await queryRunner.release();
        }
    }
}

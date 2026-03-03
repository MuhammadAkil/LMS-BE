import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import { CompanyProfileResponse, UpdateCompanyBankAccountRequest } from '../dto/CompanyDtos';

/**
 * Company Profile Service
 * Manages company profile data
 *
 * Fintech compliance:
 * - Most fields are read-only (name, status, approval status)
 * - ONLY bank_account is editable
 * - Changes to bank_account require audit log
 * - No changes to contractual fields allowed
 */
export class CompanyProfileService {
    private auditService: CompanyAuditService;

    constructor() {
        this.auditService = new CompanyAuditService();
    }

    /**
     * Get company profile
     * Includes all company information
     */
    async getProfile(companyId: number): Promise<CompanyProfileResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const company = await queryRunner.query(
                `
        SELECT 
          c.id,
          c.name,
          c.bankAccount,
          c.status_id as statusId,
          c.conditions_status as conditionsStatus,
          c.conditions_locked_at as conditionsLockedAt,
          us.code as statusName,
          c.conditions_json as conditionsJson,
          c.approved_at as approvedAt,
          c.created_at as createdAt,
          c.updated_at as updatedAt
        FROM companies c
        LEFT JOIN user_statuses us ON c.status_id = us.id
        WHERE c.id = ?
        `,
                [companyId]
            );

            if (!company || company.length === 0) {
                throw new Error('Company not found');
            }

            const hasSignedAgreement = await queryRunner.query(
                `SELECT 1 FROM management_agreements WHERE companyId = ? AND signedAt IS NOT NULL LIMIT 1`,
                [companyId]
            );
            const agreementSigned = hasSignedAgreement && hasSignedAgreement.length > 0;

            return {
                id: company[0].id,
                name: company[0].name,
                bankAccount: company[0].bankAccount,
                statusId: company[0].statusId,
                statusName: company[0].statusName,
                conditionsJson: company[0].conditionsJson,
                conditionsStatus: company[0].conditionsStatus ?? (company[0].conditionsLockedAt ? 'approved' : (company[0].conditionsJson ? 'pending_approval' : 'not_submitted')),
                agreementSigned,
                approvedAt: company[0].approvedAt,
                createdAt: company[0].createdAt,
                updatedAt: company[0].updatedAt,
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Update bank account ONLY
     * Fintech rule: Only editable field on company profile
     * Triggers: COMPANY_PROFILE_UPDATED audit log
     */
    async updateBankAccount(
        companyId: number,
        userId: number,
        bankAccount: string
    ): Promise<CompanyProfileResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Validate bank account format (basic check)
            if (!bankAccount || bankAccount.trim().length === 0) {
                throw new Error('Bank account cannot be empty');
            }

            // Update bank_account
            await queryRunner.query(
                `
        UPDATE companies
        SET bankAccount = ?, updated_at = NOW()
        WHERE id = ?
        `,
                [bankAccount, companyId]
            );

            // Create audit log
            await this.auditService.logAction(
                userId,
                'COMPANY_PROFILE_UPDATED',
                'COMPANY',
                companyId,
                {
                    field: 'bank_account',
                    newValue: bankAccount,
                    timestamp: new Date(),
                }
            );

            // Notify about profile change
            await this.auditService.notifyUser(userId, 'COMPANY_PROFILE_UPDATED', {
                title: 'Profile updated',
                message: 'Bank account has been updated',
                field: 'bank_account',
                timestamp: new Date(),
            });

            // Return updated profile
            return this.getProfile(companyId);
        } finally {
            await queryRunner.release();
        }
    }
}

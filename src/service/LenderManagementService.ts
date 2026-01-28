import {
    ManagementCompaniesResponse,
    ManagementCompanyDto,
    CreateManagementAgreementRequest,
    ManagementAgreementDto,
    ManagementAgreementsResponse,
} from '../dto/LenderDtos';
import { AuditLogRepository } from '../repository/AuditLogRepository';

/**
 * L-07: LENDER MANAGEMENT AGREEMENTS SERVICE
 * Delegate investments to management companies
 * Requires verification level and bank account
 */
export class LenderManagementService {
    private auditLogRepository: AuditLogRepository;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
    }

    /**
     * Get available management companies
     * Only shows approved companies
     * Read-only
     * 
     * SQL:
     * SELECT 
     *   c.id,
     *   c.name,
     *   c.bank_account,
     *   cs.code as status_code,
     *   cs.name as status_name,
     *   c.approved_at,
     *   c.conditions_json as conditions
     * FROM companies c
     * JOIN user_statuses cs ON cs.id = c.status_id
     * WHERE cs.code = 'ACTIVE'
     * ORDER BY c.name ASC
     */
    async getManagementCompanies(
        lenderId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<ManagementCompaniesResponse> {
        try {
            const offset = (page - 1) * pageSize;

            // TODO: Query approved companies
            const companies: ManagementCompanyDto[] = [];
            const totalItems = 0;

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} viewed management companies`);

            return {
                companies,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
            };
        } catch (error: any) {
            console.error('Error fetching management companies:', error);
            throw new Error('Failed to fetch management companies');
        }
    }

    /**
     * Create management agreement
     * Rules:
     * - Requires verification level >= required (from platform_config)
     * - Requires verified bank account
     * - Generates PDF contract
     * - Creates immutable agreement record
     * 
     * SQL:
     * INSERT INTO management_agreements (lender_id, company_id, amount, signed_at) 
     * VALUES (?, ?, ?, NOW())
     */
    async createManagementAgreement(
        lenderId: string,
        request: CreateManagementAgreementRequest
    ): Promise<ManagementAgreementDto> {
        try {
            // TODO: Verify company exists and is ACTIVE
            // TODO: Verify lender has required verification level
            // TODO: Verify lender has verified bank account (both guards should catch this)

            // TODO: Generate PDF contract from template
            // TODO: BEGIN TRANSACTION
            // TODO: INSERT into management_agreements
            // TODO: Store PDF file
            // TODO: INSERT into audit_logs
            // TODO: Send notification to company + lender
            // TODO: COMMIT

            const agreementId = 'MGA_' + Date.now();
            const pdfPath = `/contracts/${agreementId}_agreement.pdf`;

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} signed management agreement ${agreementId}`);

            return {
                id: agreementId,
                lenderId,
                companyId: request.companyId,
                companyName: 'Placeholder Company', // TODO: Fetch from DB
                amount: request.amount,
                signedAt: new Date().toISOString(),
                pdfPath,
                status: 'ACTIVE',
            };
        } catch (error: any) {
            console.error('Error creating management agreement:', error);
            throw new Error('Failed to create management agreement');
        }
    }

    /**
     * Get lender's management agreements
     * Shows active agreements with companies
     * 
     * SQL:
     * SELECT 
     *   ma.id,
     *   ma.lender_id,
     *   ma.company_id,
     *   c.name as company_name,
     *   ma.amount,
     *   ma.signed_at,
     *   ma.pdf_path,
     *   CASE 
     *     WHEN NOW() > DATE_ADD(ma.signed_at, INTERVAL 1 YEAR) THEN 'TERMINATED'
     *     ELSE 'ACTIVE'
     *   END as status
     * FROM management_agreements ma
     * JOIN companies c ON c.id = ma.company_id
     * WHERE ma.lender_id = ?
     * ORDER BY ma.signed_at DESC
     */
    async getManagementAgreements(
        lenderId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<ManagementAgreementsResponse> {
        try {
            const offset = (page - 1) * pageSize;

            // TODO: Query management_agreements for lender
            const agreements: ManagementAgreementDto[] = [];
            const totalItems = 0;

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} viewed management agreements`);

            return {
                agreements,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
            };
        } catch (error: any) {
            console.error('Error fetching management agreements:', error);
            throw new Error('Failed to fetch management agreements');
        }
    }

    /**
     * Terminate management agreement
     * Marks agreement as TERMINATED
     * Must wait for all investments to be settled
     */
    async terminateAgreement(
        lenderId: string,
        agreementId: string
    ): Promise<{ message: string; terminatedAt: string }> {
        try {
            // TODO: Verify lender owns agreement
            // TODO: Check if all investments are settled
            // TODO: UPDATE agreement status to TERMINATED

            // Audit log placeholder (replace with actual repository method when available)
            console.log(`Audit: User ${lenderId} terminated management agreement ${agreementId}`);

            return {
                message: 'Agreement terminated successfully',
                terminatedAt: new Date().toISOString(),
            };
        } catch (error: any) {
            console.error('Error terminating agreement:', error);
            throw new Error('Failed to terminate agreement');
        }
    }
}

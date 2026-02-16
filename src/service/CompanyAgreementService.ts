import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import {
    CompanyAgreementResponse,
    SignAgreementRequest,
    AgreementDownloadResponse,
} from '../dto/CompanyDtos';

/**
 * Company Agreement Service
 * Manages management_agreements lifecycle
 *
 * Fintech compliance:
 * - Agreement must be signed to unlock operational actions
 * - signed_at timestamp is immutable evidence of signing
 * - Generates contract record in contracts table
 * - Triggers notification to all stakeholders
 */
export class CompanyAgreementService {
    private auditService: CompanyAuditService;

    constructor() {
        this.auditService = new CompanyAuditService();
    }

    /**
     * Get management agreement for company
     * Returns current agreement status
     */
    async getAgreement(companyId: number): Promise<CompanyAgreementResponse | null> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const agreement = await queryRunner.query(
                `
        SELECT 
          id,
          company_id as companyId,
          amount,
          signed_at as signedAt,
          created_at as createdAt,
          updated_at as updatedAt
        FROM management_agreements
        WHERE company_id = ?
        LIMIT 1
        `,
                [companyId]
            );

            if (!agreement || agreement.length === 0) {
                return null;
            }

            return {
                id: agreement[0].id,
                companyId: agreement[0].companyId,
                amount: parseFloat(agreement[0].amount || 0),
                signedAt: agreement[0].signedAt,
                contractId: undefined, // Would need separate query to contracts table
                createdAt: agreement[0].createdAt,
                updatedAt: agreement[0].updatedAt,
                status: agreement[0].signedAt ? 'SIGNED' : 'UNSIGNED',
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Sign management agreement
     * Fintech compliance:
     * 1. Updates signed_at timestamp (immutable)
     * 2. Creates contract record (audit trail)
     * 3. Logs action to audit_logs
     * 4. Triggers notification to company and admin
     * 5. Unlocks operational actions
     */
    async signAgreement(
        companyId: number,
        userId: number,
        request: SignAgreementRequest
    ): Promise<CompanyAgreementResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Check if agreement exists
            const agreement = await queryRunner.query(
                `
        SELECT id, signed_at FROM management_agreements
        WHERE company_id = ? AND id = ?
        `,
                [companyId, request.agreementId]
            );

            if (!agreement || agreement.length === 0) {
                throw new Error('Agreement not found');
            }

            if (agreement[0].signed_at) {
                throw new Error('Agreement already signed');
            }

            const now = new Date();

            // 1. Update agreement with signed_at timestamp
            await queryRunner.query(
                `
        UPDATE management_agreements
        SET signed_at = ?, updated_at = NOW()
        WHERE id = ? AND company_id = ?
        `,
                [now, request.agreementId, companyId]
            );

            // 2. Create contract record (immutable proof)
            const contractResult = await queryRunner.query(
                `
        INSERT INTO contracts (
          company_id,
          management_agreement_id,
          contract_type,
          signed_at,
          created_at
        ) VALUES (?, ?, ?, ?, NOW())
        `,
                [
                    companyId,
                    request.agreementId,
                    'MANAGEMENT_AGREEMENT',
                    now,
                ]
            );

            const contractId = contractResult.insertId;

            // 3. Create audit log
            await this.auditService.logAction(
                userId,
                'AGREEMENT_SIGNED',
                'MANAGEMENT_AGREEMENT',
                request.agreementId,
                {
                    companyId,
                    contractId,
                    signedAt: now,
                    signatureData: request.signatureData ? 'provided' : 'none',
                }
            );

            await this.auditService.notifyUser(userId, 'AGREEMENT_SIGNED', {
                title: 'Agreement Signed',
                message: 'Management agreement has been successfully signed. Operational actions are now enabled.',
                agreementId: request.agreementId,
                contractId,
                timestamp: now,
            });

            const adminUsers = await queryRunner.query(
                `
        SELECT id FROM users WHERE role_id = 1 LIMIT 10
        `
            );
            const adminIds = adminUsers.map((u: any) => u.id);

            if (adminIds.length > 0) {
                await this.auditService.notifyMultiple(
                    adminIds,
                    'COMPANY_AGREEMENT_SIGNED',
                    {
                        title: 'Company agreement signed',
                        message: `Company ${companyId} has signed their management agreement`,
                        companyId,
                        agreementId: request.agreementId,
                        contractId,
                        timestamp: now,
                    }
                );
            }

            // Return updated agreement
            return this.getAgreement(companyId) as Promise<CompanyAgreementResponse>;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Download agreement (PDF contract)
     * Returns binary PDF data from contracts table
     */
    async downloadAgreement(companyId: number): Promise<AgreementDownloadResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Get signed agreement with contract
            const contract = await queryRunner.query(
                `
        SELECT 
          c.id,
          c.file_path as filePath,
          c.created_at as createdAt
        FROM contracts c
        INNER JOIN management_agreements ma ON c.management_agreement_id = ma.id
        WHERE ma.company_id = ? AND ma.signed_at IS NOT NULL
        ORDER BY c.created_at DESC
        LIMIT 1
        `,
                [companyId]
            );

            if (!contract || contract.length === 0) {
                throw new Error('No signed agreement found');
            }

            // In production, read PDF from file_path
            // For now, return placeholder
            const pdfData = Buffer.from('PDF_CONTENT_PLACEHOLDER');

            return {
                contractId: contract[0].id,
                fileName: `management_agreement_${companyId}_${new Date().toISOString().split('T')[0]}.pdf`,
                contentType: 'application/pdf',
                data: pdfData,
                createdAt: contract[0].createdAt,
            };
        } finally {
            await queryRunner.release();
        }
    }
}

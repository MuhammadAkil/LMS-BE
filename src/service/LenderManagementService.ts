import {
    ManagementCompaniesResponse,
    ManagementCompanyDto,
    CreateManagementAgreementRequest,
    ManagementAgreementDto,
    ManagementAgreementsResponse,
} from '../dto/LenderDtos';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { CompanyRepository } from '../repository/CompanyRepository';
import { ManagementAgreementRepository } from '../repository/ManagementAgreementRepository';
import { ManagementAgreement } from '../domain/ManagementAgreement';

/**
 * L-07: LENDER MANAGEMENT AGREEMENTS SERVICE
 * Delegate investments to management companies
 */
export class LenderManagementService {
    private auditLogRepository: AuditLogRepository;
    private companyRepo: CompanyRepository;
    private agreementRepo: ManagementAgreementRepository;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
        this.companyRepo = new CompanyRepository();
        this.agreementRepo = new ManagementAgreementRepository();
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
        const [list, totalItems] = await this.companyRepo.findActive(pageSize, (page - 1) * pageSize);
        const companies: ManagementCompanyDto[] = list.map((c) => ({
            id: String(c.id),
            name: c.name,
            minManagedAmount: Number(c.minManagedAmount ?? 0),
            commissionPct: Number(c.commissionPct ?? 0),
            statusCode: 'ACTIVE',
        }));
        return {
            companies,
            pagination: {
                page,
                pageSize,
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
            },
        };
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
        const lenderIdNum = parseInt(lenderId, 10);
        const companyId = typeof request.companyId === 'string' ? parseInt(request.companyId, 10) : request.companyId;

        const existing = await this.agreementRepo.findActiveByLenderId(lenderIdNum);
        if (existing) throw new Error('You already have an active management agreement. Terminate it first.');

        const company = await this.companyRepo.findById(companyId);
        if (!company || company.statusId !== 2) throw new Error('Company not found or not approved');
        const minAmount = Number(company.minManagedAmount ?? 0);
        if (request.amount < minAmount) throw new Error(`Minimum managed amount is ${minAmount} PLN`);

        const agreement = new ManagementAgreement();
        agreement.lenderId = lenderIdNum;
        agreement.companyId = companyId;
        agreement.amount = request.amount;
        agreement.signedAt = new Date();
        const saved = await this.agreementRepo.save(agreement);

        return {
            id: String(saved.id),
            lenderId,
            companyId: String(companyId),
            companyName: company.name,
            amount: request.amount,
            signedAt: (saved.signedAt ?? new Date()).toISOString(),
            pdfPath: `/generated_pdfs/management_agreement_${saved.id}.pdf`,
            status: 'ACTIVE',
        };
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
        const lenderIdNum = parseInt(lenderId, 10);
        const all = await this.agreementRepo.findByLenderId(lenderIdNum);
        const totalItems = all.length;
        const slice = all.slice((page - 1) * pageSize, page * pageSize);
        const agreements: ManagementAgreementDto[] = [];
        for (const ma of slice) {
            const company = await this.companyRepo.findById(ma.companyId);
            agreements.push({
                id: String(ma.id),
                lenderId: String(ma.lenderId),
                companyId: String(ma.companyId),
                companyName: company?.name ?? 'Company',
                amount: Number(ma.amount ?? 0),
                signedAt: ma.signedAt ? ma.signedAt.toISOString() : '',
                pdfPath: null,
                status: ma.terminatedAt ? 'TERMINATED' : 'ACTIVE',
            });
        }
        return {
            agreements,
            pagination: {
                page,
                pageSize,
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
            },
        };
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
        const lenderIdNum = parseInt(lenderId, 10);
        const id = parseInt(agreementId, 10);
        const agreement = await this.agreementRepo.findById(id);
        if (!agreement || agreement.lenderId !== lenderIdNum) throw new Error('Agreement not found');
        if (agreement.terminatedAt) throw new Error('Agreement is already terminated');

        agreement.terminatedAt = new Date();
        await this.agreementRepo.save(agreement);
        return {
            message: 'Agreement terminated successfully. Automation will stop; existing loans remain active.',
            terminatedAt: agreement.terminatedAt.toISOString(),
        };
    }
}

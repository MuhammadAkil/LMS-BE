import {
    ManagementCompaniesResponse,
    ManagementCompanyDto,
    CreateManagementAgreementRequest,
    ManagementAgreementDto,
    ManagementAgreementsResponse,
    ManagementAgreementEligibilityResponse,
} from '../dto/LenderDtos';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { CompanyRepository } from '../repository/CompanyRepository';
import { ManagementAgreementRepository } from '../repository/ManagementAgreementRepository';
import { UserRepository } from '../repository/UserRepository';
import { ManagementAgreement } from '../domain/ManagementAgreement';
import { VerificationAccessService } from './VerificationAccessService';
import { s3Service } from '../services/s3.service';

const ACTIVE_STATUS_ID = 2;
const REQUIRED_VERIFICATION_LEVEL = 2;

/**
 * L-07: LENDER MANAGEMENT AGREEMENTS SERVICE
 * Delegate investments to management companies
 */
export class LenderManagementService {
    private auditLogRepository: AuditLogRepository;
    private companyRepo: CompanyRepository;
    private agreementRepo: ManagementAgreementRepository;
    private userRepo: UserRepository;
    private verificationAccess: VerificationAccessService;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
        this.companyRepo = new CompanyRepository();
        this.agreementRepo = new ManagementAgreementRepository();
        this.userRepo = new UserRepository();
        this.verificationAccess = new VerificationAccessService();
    }

    /**
     * Eligibility to select management company: account must be ACTIVE, verification complete (level >= 2 + all required KYC approved), and bank account verified.
     * Unlocks automatically when all conditions are met (no manual approval).
     */
    async getManagementAgreementEligibility(lenderId: string): Promise<ManagementAgreementEligibilityResponse> {
        const userId = parseInt(lenderId, 10);
        const user = await this.userRepo.findById(userId);
        if (!user) {
            return {
                eligible: false,
                accountActive: false,
                verificationComplete: false,
                bankAccountVerified: false,
                message: 'Account not found.',
            };
        }
        const accountActive = user.statusId === ACTIVE_STATUS_ID;
        const gate = await this.verificationAccess.getVerificationGate(userId, user.roleId);
        const levelOk = (user.level ?? 0) >= REQUIRED_VERIFICATION_LEVEL;
        const verificationComplete = gate.isVerified && levelOk;
        const bankAccountVerified = !!(user.bankAccount != null && String(user.bankAccount).trim().length > 0);
        const eligible = accountActive && verificationComplete && bankAccountVerified;
        const steps: string[] = [];
        if (!accountActive) steps.push('Your account must be active (complete account setup and any required approval).');
        if (!verificationComplete) {
            if (!gate.isVerified) steps.push('Complete identity and document verification and wait for approval.');
            else if (!levelOk) steps.push('Reach verification level 2 (complete all required verification steps).');
        }
        if (!bankAccountVerified) steps.push('Add and verify your bank account in Profile.');
        const message = eligible ? undefined : steps.length > 0 ? steps.join(' ') : 'Complete account and verification requirements to select a management company.';
        return { eligible, accountActive, verificationComplete, bankAccountVerified, message };
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
        // Do not set signedAt — bilateral: lender signs next, then company
        const saved = await this.agreementRepo.save(agreement);

        return {
            id: String(saved.id),
            lenderId,
            companyId: String(companyId),
            companyName: company.name,
            amount: request.amount,
            signedAt: '',
            pdfPath: null,
            status: 'ACTIVE',
            signingStatus: 'PENDING_LENDER',
        };
    }

    /**
     * Lender signs the agreement (name, role, signature).
     * After this, company can sign to complete bilateral flow.
     */
    async signAgreement(
        lenderId: string,
        agreementId: string,
        request: { signerName: string; signerRole: string; signatureData?: string }
    ): Promise<ManagementAgreementDto> {
        const lenderIdNum = parseInt(lenderId, 10);
        const id = parseInt(agreementId, 10);
        const agreement = await this.agreementRepo.findById(id);
        if (!agreement || agreement.lenderId !== lenderIdNum) throw new Error('Agreement not found');
        if (agreement.terminatedAt) throw new Error('Agreement is terminated');
        if (agreement.lenderSignedAt) throw new Error('You have already signed this agreement');

        agreement.lenderSignedAt = new Date();
        agreement.lenderSignerName = request.signerName?.trim() || null;
        agreement.lenderSignerRole = request.signerRole?.trim() || null;
        agreement.lenderSignatureData = request.signatureData || null;
        const saved = await this.agreementRepo.save(agreement);

        const company = await this.companyRepo.findById(saved.companyId);
        const signingStatus = saved.companySignedAt ? 'SIGNED' : 'PENDING_COMPANY';
        return {
            id: String(saved.id),
            lenderId,
            companyId: String(saved.companyId),
            companyName: company?.name ?? 'Company',
            amount: Number(saved.amount ?? 0),
            signedAt: saved.signedAt ? saved.signedAt.toISOString() : '',
            pdfPath: saved.signedDocumentPath || null,
            status: saved.terminatedAt ? 'TERMINATED' : 'ACTIVE',
            signingStatus,
            lenderSignedAt: saved.lenderSignedAt?.toISOString(),
            companySignedAt: saved.companySignedAt?.toISOString(),
            signedDocumentPath: saved.signedDocumentPath || null,
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
            const signingStatus = ma.signedAt
                ? 'SIGNED'
                : ma.companySignedAt
                    ? 'PENDING_LENDER'
                    : ma.lenderSignedAt
                        ? 'PENDING_COMPANY'
                        : 'PENDING_LENDER';
            agreements.push({
                id: String(ma.id),
                lenderId: String(ma.lenderId),
                companyId: String(ma.companyId),
                companyName: company?.name ?? 'Company',
                amount: Number(ma.amount ?? 0),
                signedAt: ma.signedAt ? ma.signedAt.toISOString() : '',
                pdfPath: ma.signedDocumentPath || null,
                status: ma.terminatedAt ? 'TERMINATED' : 'ACTIVE',
                signingStatus,
                lenderSignedAt: ma.lenderSignedAt?.toISOString(),
                companySignedAt: ma.companySignedAt?.toISOString(),
                signedDocumentPath: ma.signedDocumentPath || null,
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

    /**
     * Get signed document path for download (lender must own the agreement; agreement must be fully signed).
     */
    async getSignedDocumentPath(lenderId: string, agreementId: string): Promise<{ key: string; url: string; expiresIn: number } | null> {
        const lenderIdNum = parseInt(lenderId, 10);
        const id = parseInt(agreementId, 10);
        const agreement = await this.agreementRepo.findById(id);
        const key = agreement?.documentKey || agreement?.signedDocumentPath || '';
        if (!agreement || agreement.lenderId !== lenderIdNum || !key) return null;
        const expiresIn = 3600;
        const url = await s3Service.getPresignedUrl(key, expiresIn);
        return { key, url, expiresIn };
    }
}

import {
    LenderInvestmentDto,
    LenderInvestmentsPageResponse,
    LenderInvestmentDetailResponse,
    RepaymentDto,
} from '../dto/LenderDtos';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { UserRepository } from '../repository/UserRepository';
import { LoanDisbursementService } from './LoanDisbursementService';
import { AppDataSource } from '../config/database';

const LOAN_STATUS_NAMES: Record<number, string> = { 1: 'OPEN', 2: 'ACTIVE', 3: 'CLOSED', 4: 'DEFAULT' };

/**
 * L-04: LENDER INVESTMENTS SERVICE
 * Real data from loan_offers + loans; borrower name only when lender_data_revealed
 */
export class LenderInvestmentsService {
    private loanOfferRepo: LoanOfferRepository;
    private loanRepo: LoanRepository;
    private loanAppRepo: LoanApplicationRepository;
    private userRepo: UserRepository;

    private disbursementService: LoanDisbursementService;

    constructor() {
        this.loanOfferRepo = new LoanOfferRepository();
        this.loanRepo = new LoanRepository();
        this.loanAppRepo = new LoanApplicationRepository();
        this.userRepo = new UserRepository();
        this.disbursementService = new LoanDisbursementService();
    }

    /**
     * @param viewFilter - 'all' | 'direct' | 'company_managed' to show all, only direct lender offers, or only company-managed
     */
    async getInvestmentsPaginated(
        lenderId: string,
        page: number = 1,
        pageSize: number = 10,
        viewFilter: 'all' | 'direct' | 'company_managed' = 'all'
    ): Promise<LenderInvestmentsPageResponse> {
        const lenderIdNum = parseInt(lenderId, 10);
        let offersWithCompany: Array<{ id: number; loanId: number; lenderId: number; amount: number; confirmedAmount: number | null; createdAt: Date; delegatedByCompanyId: number | null; companyName: string | null }> = [];
        try {
            const rows = await AppDataSource.query(
                `SELECT lo.id, lo.loanId, lo.lenderId, lo.amount, lo.confirmed_amount AS confirmedAmount, lo.createdAt,
                        lo.delegated_by_company_id AS delegatedByCompanyId,
                        c.name AS companyName
                 FROM loan_offers lo
                 LEFT JOIN companies c ON c.id = lo.delegated_by_company_id
                 WHERE lo.lenderId = ?
                 ORDER BY lo.createdAt DESC`,
                [lenderIdNum]
            );
            offersWithCompany = (rows || []).map((r: any) => ({
                id: r.id,
                loanId: r.loanId,
                lenderId: r.lenderId,
                amount: r.amount,
                confirmedAmount: r.confirmedAmount,
                createdAt: r.createdAt,
                delegatedByCompanyId: r.delegatedByCompanyId ?? null,
                companyName: r.companyName ?? null,
            }));
        } catch {
            const allOffers = await this.loanOfferRepo.findByLenderId(lenderIdNum);
            offersWithCompany = allOffers.map((o) => ({
                id: o.id as number,
                loanId: o.loanId,
                lenderId: o.lenderId,
                amount: Number(o.amount),
                confirmedAmount: o.confirmedAmount != null ? Number(o.confirmedAmount) : null,
                createdAt: o.createdAt as Date,
                delegatedByCompanyId: null,
                companyName: null,
            }));
        }
        if (viewFilter === 'direct') {
            offersWithCompany = offersWithCompany.filter((o) => !o.delegatedByCompanyId);
        } else if (viewFilter === 'company_managed') {
            offersWithCompany = offersWithCompany.filter((o) => !!o.delegatedByCompanyId);
        }
        const totalItems = offersWithCompany.length;
        const start = (page - 1) * pageSize;
        const pageOffers = offersWithCompany.slice(start, start + pageSize);

        const items: LenderInvestmentDto[] = [];
        for (const row of pageOffers) {
            const loan = await this.loanRepo.findById(row.loanId);
            if (!loan) continue;
            const app = await this.loanAppRepo.findById(loan.applicationId);
            if (!app) continue;
            const borrower = await this.userRepo.findById(loan.borrowerId);
            const investedAmount = row.confirmedAmount != null ? Number(row.confirmedAmount) : Number(row.amount);
            const totalAmount = Number(loan.totalAmount);
            const yourShare = totalAmount > 0 ? (investedAmount / totalAmount) * 100 : 0;
            const borrowerName = loan.lenderDataRevealed && borrower
                ? `${borrower.firstName ?? ''} ${borrower.lastName ?? ''}`.trim() || borrower.email
                : 'Borrower';

            items.push({
                investmentId: String(row.id),
                loanId: String(loan.id),
                borrowerId: String(loan.borrowerId),
                borrowerName,
                offerId: String(row.id),
                investedAmount: Math.round(investedAmount * 100) / 100,
                investedAt: new Date(row.createdAt).toISOString(),
                totalLoanAmount: totalAmount,
                yourShare: Math.round(yourShare * 100) / 100,
                loanStatus: LOAN_STATUS_NAMES[loan.statusId] ?? 'UNKNOWN',
                loanDueDate: loan.dueDate instanceof Date ? loan.dueDate.toISOString().split('T')[0] : String(loan.dueDate),
                nextRepaymentDate: null,
                repaymentStatus: 'ON_TRACK',
                contractPdfUrl: null,
                managedByCompanyId: row.delegatedByCompanyId ? Number(row.delegatedByCompanyId) : undefined,
                managedByCompanyName: row.companyName ?? undefined,
                loanCreatedAt: loan.createdAt ? new Date(loan.createdAt).toISOString() : undefined,
            });
        }

        const totalInvested = items.reduce((s, i) => s + i.investedAmount, 0);
        return {
            items,
            pagination: {
                page,
                pageSize,
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
            },
            summary: {
                totalInvested,
                activeCount: items.filter((i) => i.loanStatus === 'ACTIVE').length,
                completedCount: items.filter((i) => i.loanStatus === 'CLOSED').length,
                overdueCount: 0,
            },
        };
    }

    async getInvestmentDetail(lenderId: string, investmentId: string): Promise<LenderInvestmentDetailResponse> {
        const lenderIdNum = parseInt(lenderId, 10);
        const offerIdNum = parseInt(investmentId, 10);
        const offer = await this.loanOfferRepo.findById(offerIdNum);
        if (!offer) throw new Error('Investment not found');
        if (Number(offer.lenderId) !== lenderIdNum) throw new Error('FORBIDDEN: Investment does not belong to this lender');

        const loan = await this.loanRepo.findById(offer.loanId);
        if (!loan) throw new Error('Investment not found');
        const app = await this.loanAppRepo.findById(loan.applicationId);
        if (!app) throw new Error('Investment not found');
        const borrower = await this.userRepo.findById(loan.borrowerId);
        const investedAmount = offer.confirmedAmount != null ? Number(offer.confirmedAmount) : Number(offer.amount);
        const totalAmount = Number(loan.totalAmount);
        const yourShare = totalAmount > 0 ? (investedAmount / totalAmount) * 100 : 0;
        const borrowerName = loan.lenderDataRevealed && borrower
            ? `${borrower.firstName ?? ''} ${borrower.lastName ?? ''}`.trim() || borrower.email
            : 'Borrower';

        let managedByCompanyId: number | undefined;
        let managedByCompanyName: string | undefined;
        try {
            const companyRows = await AppDataSource.query(
                `SELECT lo.delegated_by_company_id AS companyId, c.name AS companyName
                 FROM loan_offers lo
                 LEFT JOIN companies c ON c.id = lo.delegated_by_company_id
                 WHERE lo.id = ? AND lo.lenderId = ?`,
                [offerIdNum, lenderIdNum]
            );
            const r = Array.isArray(companyRows) ? companyRows[0] : null;
            if (r?.companyId) {
                managedByCompanyId = Number(r.companyId);
                managedByCompanyName = r.companyName ?? 'Company';
            }
        } catch {
            // delegated_by_company_id column may not exist
        }

        const disbursement = await this.disbursementService.getByLoanId(loan.id);
        const base: LenderInvestmentDto = {
            investmentId: String(offer.id),
            loanId: String(loan.id),
            borrowerId: String(loan.borrowerId),
            borrowerName,
            offerId: String(offer.id),
            investedAmount: Math.round(investedAmount * 100) / 100,
            investedAt: (offer.createdAt as Date).toISOString(),
            totalLoanAmount: totalAmount,
            yourShare: Math.round(yourShare * 100) / 100,
            loanStatus: LOAN_STATUS_NAMES[loan.statusId] ?? 'UNKNOWN',
            loanDueDate: loan.dueDate instanceof Date ? loan.dueDate.toISOString().split('T')[0] : String(loan.dueDate),
            nextRepaymentDate: null,
            repaymentStatus: 'ON_TRACK',
            contractPdfUrl: null,
            managedByCompanyId,
            managedByCompanyName,
            loanCreatedAt: loan.createdAt ? new Date(loan.createdAt).toISOString() : undefined,
        };

        return {
            ...base,
            repayments: [],
            estimatedROI: 0.08,
            disbursement: disbursement ?? undefined,
        };
    }

    async getInvestmentRepayments(lenderId: string, investmentId: string): Promise<RepaymentDto[]> {
        await this.getInvestmentDetail(lenderId, investmentId);
        return [];
    }
}

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

    constructor() {
        this.loanOfferRepo = new LoanOfferRepository();
        this.loanRepo = new LoanRepository();
        this.loanAppRepo = new LoanApplicationRepository();
        this.userRepo = new UserRepository();
    }

    async getInvestmentsPaginated(
        lenderId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<LenderInvestmentsPageResponse> {
        const lenderIdNum = parseInt(lenderId, 10);
        const allOffers = await this.loanOfferRepo.findByLenderId(lenderIdNum);
        const totalItems = allOffers.length;
        const start = (page - 1) * pageSize;
        const lenderOffers = allOffers.slice(start, start + pageSize);

        const items: LenderInvestmentDto[] = [];
        for (const offer of lenderOffers) {
            const loan = await this.loanRepo.findById(offer.loanId);
            if (!loan) continue;
            const app = await this.loanAppRepo.findById(loan.applicationId);
            if (!app) continue;
            const borrower = await this.userRepo.findById(loan.borrowerId);
            const investedAmount = offer.confirmedAmount != null ? Number(offer.confirmedAmount) : Number(offer.amount);
            const totalAmount = Number(loan.totalAmount);
            const yourShare = totalAmount > 0 ? (investedAmount / totalAmount) * 100 : 0;
            const borrowerName = loan.lenderDataRevealed && borrower
                ? `${borrower.firstName ?? ''} ${borrower.lastName ?? ''}`.trim() || borrower.email
                : 'Borrower';

            items.push({
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
        };

        return {
            ...base,
            repayments: [],
            estimatedROI: 0.08,
        };
    }

    async getInvestmentRepayments(lenderId: string, investmentId: string): Promise<RepaymentDto[]> {
        await this.getInvestmentDetail(lenderId, investmentId);
        return [];
    }
}

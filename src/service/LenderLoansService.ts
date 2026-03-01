import {
    LoanBrowseItemDto,
    LoanBrowsePageResponse,
    LoanDetailResponse,
    LoanBrowseFilterDto,
    LoanOfferDto,
} from '../dto/LenderDtos';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { UserRepository } from '../repository/UserRepository';
const MIN_OFFER_PLN = 10;

/**
 * L-02: LENDER LOANS SERVICE
 * Browse available loans (OPEN), show funding progress
 */
export class LenderLoansService {
    private loanRepo: LoanRepository;
    private loanAppRepo: LoanApplicationRepository;
    private loanOfferRepo: LoanOfferRepository;
    private userRepo: UserRepository;

    constructor() {
        this.loanRepo = new LoanRepository();
        this.loanAppRepo = new LoanApplicationRepository();
        this.loanOfferRepo = new LoanOfferRepository();
        this.userRepo = new UserRepository();
    }

    async browseLoansPaginated(
        lenderId: string,
        filters: LoanBrowseFilterDto
    ): Promise<LoanBrowsePageResponse> {
        try {
            const page = filters.page || 1;
            const pageSize = filters.pageSize || 10;
            const lenderIdNum = parseInt(lenderId, 10);

            const [loans, totalItems] = await this.loanRepo.findOpenPaginated(page, pageSize);

            const items: LoanBrowseItemDto[] = [];
            for (const loan of loans) {
                const app = await this.loanAppRepo.findById(loan.applicationId);
                if (!app) continue;
                if (filters.minAmount != null && Number(loan.totalAmount) < filters.minAmount) continue;
                if (filters.maxAmount != null && Number(loan.totalAmount) > filters.maxAmount) continue;
                if (filters.minDuration != null && app.durationMonths < filters.minDuration) continue;
                if (filters.maxDuration != null && app.durationMonths > filters.maxDuration) continue;

                const offers = await this.loanOfferRepo.findByLoanId(loan.id);
                const totalOffered = offers.reduce((s, o) => s + Number(o.amount), 0);
                const remaining = Math.max(0, Number(loan.totalAmount) - totalOffered);
                const fundedPercent = Number(loan.totalAmount) > 0
                    ? Math.min(100, (totalOffered / Number(loan.totalAmount)) * 100)
                    : 0;
                const lender = await this.userRepo.findById(lenderIdNum);
                const ctaEligible = !!(lender?.bankAccount?.trim()) && (lender?.level ?? 0) >= 0 && remaining >= MIN_OFFER_PLN;

                items.push({
                    id: String(loan.id),
                    amount: Number(loan.totalAmount),
                    durationMonths: app.durationMonths,
                    purpose: app.purpose ?? '',
                    statusCode: 'OPEN',
                    statusName: 'Open',
                    createdAt: (loan.createdAt as Date).toISOString(),
                    fundedPercent: Math.round(fundedPercent * 100) / 100,
                    remainingAmount: Math.round(remaining * 100) / 100,
                    offerCount: offers.length,
                    ctaEligible,
                });
            }

            return {
                items,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
            };
        } catch (error: any) {
            console.error('Error browsing loans:', error);
            throw new Error('Failed to browse loans');
        }
    }

    async getLoanDetail(lenderId: string, loanId: string): Promise<LoanDetailResponse> {
        const loanIdNum = parseInt(loanId, 10);
        const loan = await this.loanRepo.findById(loanIdNum);
        if (!loan) throw new Error('Loan not found');

        const app = await this.loanAppRepo.findById(loan.applicationId);
        if (!app) throw new Error('Loan not found');

        const offers = await this.loanOfferRepo.findByLoanId(loan.id);
        const totalOffered = offers.reduce((s, o) => s + Number(o.amount), 0);
        const remaining = Math.max(0, Number(loan.totalAmount) - totalOffered);
        const fundedPercent = Number(loan.totalAmount) > 0
            ? Math.min(100, (totalOffered / Number(loan.totalAmount)) * 100)
            : 0;
        // Anonymized: no lender ids, only amount and date
        const offerDtos: LoanOfferDto[] = offers.map((o, i) => ({
            lenderId: `Lender ${i + 1}`,
            amount: Number(o.amount),
            createdAt: (o.createdAt as Date).toISOString(),
        }));

        const borrower = await this.userRepo.findById(loan.borrowerId);
        const lenderIdNum = parseInt(lenderId, 10);
        const lender = await this.userRepo.findById(lenderIdNum);
        const ctaEligible = !!(lender?.bankAccount?.trim()) && (lender?.level ?? 0) >= 0 && remaining >= MIN_OFFER_PLN;

        const borrowerName = loan.lenderDataRevealed && borrower
            ? `${borrower.firstName ?? ''} ${borrower.lastName ?? ''}`.trim() || borrower.email
            : 'Borrower';
        const borrowerLevel = borrower?.level ?? 0;

        return {
            id: String(loan.id),
            amount: Number(loan.totalAmount),
            durationMonths: app.durationMonths,
            purpose: app.purpose ?? '',
            statusCode: 'OPEN',
            statusName: 'Open',
            createdAt: (loan.createdAt as Date).toISOString(),
            fundedPercent: Math.round(fundedPercent * 100) / 100,
            remainingAmount: Math.round(remaining * 100) / 100,
            offerCount: offers.length,
            offers: offerDtos,
            ctaEligible,
            borrowerName,
            borrowerLevel,
            borrowerVerificationStatus: `Level ${borrowerLevel}`,
            totalOffers: offers.length,
            fundedByOthers: totalOffered,
        };
    }

    /** Lightweight funding status for polling (e.g. loan detail modal). */
    async getFundingStatus(loanId: string): Promise<{ fundedPercent: number; remainingAmount: number; offerCount: number; statusCode: string }> {
        const loanIdNum = parseInt(loanId, 10);
        const loan = await this.loanRepo.findById(loanIdNum);
        if (!loan) throw new Error('Loan not found');
        const offers = await this.loanOfferRepo.findByLoanId(loan.id);
        const totalOffered = offers.reduce((s, o) => s + Number(o.amount), 0);
        const totalAmount = Number(loan.totalAmount);
        const remaining = Math.max(0, totalAmount - totalOffered);
        const fundedPercent = totalAmount > 0 ? Math.min(100, (totalOffered / totalAmount) * 100) : 0;
        const statusCode = loan.statusId === 1 ? 'OPEN' : loan.statusId === 2 ? 'FUNDED' : 'UNKNOWN';
        return {
            fundedPercent: Math.round(fundedPercent * 100) / 100,
            remainingAmount: Math.round(remaining * 100) / 100,
            offerCount: offers.length,
            statusCode,
        };
    }
}

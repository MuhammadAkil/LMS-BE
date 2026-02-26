import {
    PaginationParams,
    LenderDashboardStatsResponse,
    LenderDashboardAlertsResponse,
    LenderAlertDto,
} from '../dto/LenderDtos';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { LoanRepository } from '../repository/LoanRepository';
import { ManagementAgreementRepository } from '../repository/ManagementAgreementRepository';
import { CompanyRepository } from '../repository/CompanyRepository';

/**
 * L-01: LENDER DASHBOARD SERVICE
 * Real stats from loan_offers/loans; managedBy from active management agreement
 */
export class LenderDashboardService {
    private loanOfferRepo: LoanOfferRepository;
    private loanRepo: LoanRepository;
    private managementAgreementRepo: ManagementAgreementRepository;
    private companyRepo: CompanyRepository;

    constructor() {
        this.loanOfferRepo = new LoanOfferRepository();
        this.loanRepo = new LoanRepository();
        this.managementAgreementRepo = new ManagementAgreementRepository();
        this.companyRepo = new CompanyRepository();
    }

    async getDashboardStats(lenderId: string): Promise<LenderDashboardStatsResponse> {
        const lenderIdNum = parseInt(lenderId, 10);
        const offers = await this.loanOfferRepo.findByLenderId(lenderIdNum);

        let activeInvestments = 0;
        let totalInvestedAmount = 0;
        let nextRepaymentDate: Date | null = null;

        for (const offer of offers) {
            const loan = await this.loanRepo.findById(offer.loanId);
            if (!loan) continue;
            if (loan.statusId === 2) {
                activeInvestments++;
                const amt = offer.confirmedAmount != null ? Number(offer.confirmedAmount) : Number(offer.amount);
                totalInvestedAmount += amt;
            }
        }

        const activeAgreement = await this.managementAgreementRepo.findActiveByLenderId(lenderIdNum);
        let managedBy: LenderDashboardStatsResponse['managedBy'] = null;
        if (activeAgreement) {
            const company = await this.companyRepo.findById(activeAgreement.companyId);
            managedBy = company
                ? { companyId: company.id, companyName: company.name }
                : { companyId: activeAgreement.companyId, companyName: 'Company' };
        }

        return {
            activeInvestments,
            totalInvestedAmount: Math.round(totalInvestedAmount * 100) / 100,
            managedAmount: 0,
            selfInvestedAmount: totalInvestedAmount,
            expectedRepayments: 0,
            overdueLoanCount: 0,
            avgRepaymentRate: 0,
            nextRepaymentDate: nextRepaymentDate ? nextRepaymentDate.toISOString().split('T')[0] : null,
            managedBy,
            earnings: 0,
        };
    }

    async getAlerts(lenderId: string, pagination?: PaginationParams): Promise<LenderDashboardAlertsResponse> {
        const alerts: LenderAlertDto[] = [];
        return {
            alerts,
            totalCount: alerts.length,
            unreadCount: 0,
        };
    }

    async markAlertResolved(lenderId: string, alertId: string): Promise<void> {
        // No-op if no alerts table
    }
}

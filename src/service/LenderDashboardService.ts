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
import { AppDataSource } from '../config/database';

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
        const db = AppDataSource.manager;

        // â”€â”€ loan_offers / loans (existing logic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const offers = await this.loanOfferRepo.findByLenderId(lenderIdNum);
        let activeInvestments = 0;
        let totalInvestedAmount = 0;

        for (const offer of offers) {
            const loan = await this.loanRepo.findById(offer.loanId);
            if (!loan) continue;
            if (loan.statusId === 2) {
                activeInvestments++;
                const amt = offer.confirmedAmount != null ? Number(offer.confirmedAmount) : Number(offer.amount);
                totalInvestedAmount += amt;
            }
        }

        // â”€â”€ management agreement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const activeAgreement = await this.managementAgreementRepo.findActiveByLenderId(lenderIdNum);
        let managedBy: LenderDashboardStatsResponse['managedBy'] = null;
        if (activeAgreement) {
            const company = await this.companyRepo.findById(activeAgreement.companyId);
            managedBy = company
                ? { companyId: company.id, companyName: company.name }
                : { companyId: activeAgreement.companyId, companyName: 'Company' };
        }

        // â”€â”€ wallet snapshot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const walletRows = await db.query(
            'SELECT balance, available, reserved FROM investor_wallets WHERE user_id = ?',
            [lenderIdNum]
        ) as any[];
        const wallet = walletRows[0] ?? null;

        // â”€â”€ marketplace bids breakdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const bidRows = await db.query(
            `SELECT status, COUNT(*) as cnt
               FROM marketplace_bids
              WHERE lender_id = ?
              GROUP BY status`,
            [lenderIdNum]
        ) as any[];

        let bidsConfirmed = 0, bidsPending = 0, bidsRejected = 0;
        for (const row of bidRows) {
            const cnt = parseInt(row.cnt, 10);
            const s = (row.status as string).toUpperCase();
            if (s === 'CONFIRMED' || s === 'ACTIVE' || s === 'PARTIALLY_FILLED') bidsConfirmed += cnt;
            else if (s === 'PENDING') bidsPending += cnt;
            else if (s === 'REJECTED' || s === 'CANCELLED') bidsRejected += cnt;
        }
        const bidsTotal = bidsConfirmed + bidsPending + bidsRejected;

        // â”€â”€ monthly activity (last 6 months, TOP_UP + INVESTMENT transactions) â”€
        const monthlyRows = await db.query(
            `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
                    SUM(amount) AS totalAmount
               FROM transaction_logs
              WHERE user_id = ?
                AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
              GROUP BY month
              ORDER BY month ASC`,
            [lenderIdNum]
        ) as any[];

        // Build a complete 6-month array (fill gaps with 0)
        const monthlyActivity: Array<{ month: string; label: string; totalAmount: number }> = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('en-US', { month: 'short' });
            const row = monthlyRows.find((r: any) => r.month === key);
            monthlyActivity.push({ month: key, label, totalAmount: row ? parseFloat(row.totalAmount) : 0 });
        }

        return {
            activeInvestments: activeInvestments || bidsConfirmed,
            totalInvestedAmount: Math.round(totalInvestedAmount * 100) / 100,
            managedAmount: 0,
            selfInvestedAmount: totalInvestedAmount,
            expectedRepayments: 0,
            overdueLoanCount: 0,
            avgRepaymentRate: bidsTotal > 0 ? Math.round((bidsConfirmed / bidsTotal) * 100) : 0,
            nextRepaymentDate: null,
            managedBy,
            earnings: 0,
            walletBalance: wallet ? parseFloat(wallet.balance) : 0,
            walletAvailable: wallet ? parseFloat(wallet.available) : 0,
            walletReserved: wallet ? parseFloat(wallet.reserved ?? '0') : 0,
            bidsTotal,
            bidsConfirmed,
            bidsPending,
            bidsRejected,
            monthlyActivity,
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


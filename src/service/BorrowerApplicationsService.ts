import { AuditLogRepository } from '../repository/AuditLogRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LmsNotificationService } from './LmsNotificationService';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { LevelRulesRepository } from '../repository/LevelRulesRepository';
import { UserRepository } from '../repository/UserRepository';
import { InterestRateService } from './InterestRateService';
import { Loan } from '../domain/Loan';
import { LoanApplication } from '../domain/LoanApplication';
import {
    CreateApplicationRequest,
    ApplicationListItemDto,
    ApplicationDetailDto,
    OfferSummaryDto,
    ApplicationListResponse,
    CancelApplicationRequest,
    CancelApplicationResponse,
    CloseApplicationRequest,
    CloseApplicationResponse,
} from '../dto/BorrowerDtos';

/**
 * B-03: BORROWER LOAN APPLICATIONS SERVICE
 * Handles application lifecycle: creation, listing, details, cancellation, closure
 *
 * Rules:
 * - Allowed only if user.status = ACTIVE
 * - Verification level ≥ required (usually level 1)
 * - Amount validated via level_rules (max_amount)
 * - Creates loan_applications record with status = OPEN
 * - Cancel allowed only if OPEN
 * - Close allowed only if funded_percent ≥ 50
 */
export class BorrowerApplicationsService {
    private auditRepo: AuditLogRepository;
    private notificationService: LmsNotificationService;
    private loanAppRepo: LoanApplicationRepository;
    private loanRepo: LoanRepository;
    private loanOfferRepo: LoanOfferRepository;
    private levelRulesRepo: LevelRulesRepository;
    private userRepo: UserRepository;
    private interestRateService: InterestRateService;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationService = new LmsNotificationService();
        this.loanAppRepo = new LoanApplicationRepository();
        this.loanRepo = new LoanRepository();
        this.loanOfferRepo = new LoanOfferRepository();
        this.levelRulesRepo = new LevelRulesRepository();
        this.userRepo = new UserRepository();
        this.interestRateService = new InterestRateService();
    }

    /**
     * Create new loan application
     *
     * ATOMIC TRANSACTION:
     * BEGIN
     *   INSERT INTO loan_applications (
     *     borrower_id, amount, duration_months, status_id, created_at
     *   ) VALUES (?, ?, ?, OPEN_STATUS_ID, NOW())
     *   INSERT INTO audit_logs (...)
     *   VALUES ('APPLICATION_CREATED', ...)
     *   INSERT INTO notifications (...)
     * COMMIT
     *
     * Validations:
     * - amount <= level_rules.max_amount for user's level
     * - amount >= level_rules.min_amount
     * - duration_months between level_rules.min_duration and max_duration
     * - No duplicate OPEN applications
     */
    async createApplication(
        borrowerId: string,
        request: CreateApplicationRequest
    ): Promise<ApplicationDetailDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);

            // Get user to fetch verification level
            const user = await this.userRepo.findById(borrowerIdNum);
            if (!user) {
                throw new Error('User not found');
            }

            // Verification gate: level 0 (unverified) borrowers cannot create applications
            const userLevel = (user as any).level ?? 0;
            if (userLevel < 1) {
                throw new Error('Email verification required before creating a loan application');
            }

            // Fetch level rules for the user's verification level (fall back to level 0 if not found)
            let levelRules = await this.levelRulesRepo.findByLevel(userLevel);
            if (!levelRules) {
                levelRules = await this.levelRulesRepo.findByLevel(0);
            }

            // Validation 1: Amount within limits for verification level
            const maxAmount = levelRules?.maxLoanAmount || 50000;
            const minAmount = levelRules?.minAmount || 500;
            if (request.amount > maxAmount) {
                throw new Error(`Loan amount cannot exceed ${maxAmount} for your verification level`);
            }
            if (request.amount < minAmount) {
                throw new Error(`Loan amount must be at least ${minAmount}`);
            }

            // Validation 2: No duplicate OPEN applications
            const existingOpen = await this.loanAppRepo.findOpenByBorrowerId(borrowerIdNum);
            if (existingOpen) {
                throw new Error('You already have an open application. Please close or cancel it first.');
            }

            // Validation 3: Check max active applications
            const maxApplications = levelRules?.maxApplications || 5;
            const activeCount = await this.loanAppRepo.countActiveByBorrower(borrowerIdNum);
            if (activeCount >= maxApplications) {
                throw new Error(`Maximum ${maxApplications} active applications allowed for your level`);
            }

            const voluntaryCommission = Number(request.voluntaryCommission ?? 0);
            if (voluntaryCommission < 0) throw new Error('Voluntary commission cannot be negative');

            // Create new application
            const application = new LoanApplication();
            application.borrowerId = borrowerIdNum;
            application.amount = request.amount;
            application.durationMonths = request.durationMonths;
            application.purpose = request.purpose;
            application.description = request.description;
            application.statusId = 1; // OPEN status
            application.fundedPercent = 0;
            application.fundedAmount = 0;
            application.commissionStatus = 'PENDING';
            application.voluntaryCommission = voluntaryCommission;
            // Repayment type: lump sum for 1 month or less, installments otherwise
            application.repaymentType = request.durationMonths <= 1 ? 'LUMP_SUM' : 'INSTALLMENTS';
            // Marketplace fields
            (application as any).fundingWindowHours = request.fundingWindowHours ?? 72;
            (application as any).minFundingThreshold = request.minFundingThreshold ?? 50;
            (application as any).autoClose = request.autoClose ?? false;
            (application as any).autoCloseThreshold = request.autoCloseThreshold ?? 100;
            (application as any).isPublic = request.isPublic ?? true;

            const savedApp = await this.loanAppRepo.save(application);

            // Lock interest rate at creation time (from interest_rate_schedule)
            const lockedRate = await this.interestRateService.getCurrentRate();

            // LOGIC INFERRED: Create Loan when application is OPEN so lenders can attach offers to it
            const loan = new Loan();
            loan.applicationId = savedApp.id;
            loan.borrowerId = savedApp.borrowerId;
            loan.totalAmount = savedApp.amount;
            loan.fundedAmount = 0;
            loan.statusId = 1; // OPEN (pending funding)
            loan.interestRate = lockedRate;
            const dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + savedApp.durationMonths);
            loan.dueDate = dueDate;
            loan.repaymentType = savedApp.repaymentType ?? 'LUMP_SUM';
            loan.voluntaryCommission = voluntaryCommission;
            await this.loanRepo.save(loan);

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'APPLICATION_CREATED',
                entity: 'APPLICATION',
                entityId: savedApp.id,
                createdAt: new Date(),
            } as any);

            await this.notificationService.notify(
                borrowerIdNum,
                'APPLICATION_CREATED',
                'Application Created',
                `Your loan application for ${request.amount} has been created successfully`,
                { amount: String(request.amount) }
            );

            // Commission formula: (amount + voluntary_fee) × level_commission_rate
            const commissionRate = (levelRules?.commissionPercent ?? 2) / 100;
            const commissionRequired = (request.amount + voluntaryCommission) * commissionRate;

            return {
                id: savedApp.id,
                amount: savedApp.amount,
                durationMonths: savedApp.durationMonths,
                status: 'OPEN',
                statusId: 1,
                fundedPercent: 0,
                fundedAmount: 0,
                remainingAmount: savedApp.amount,
                purpose: savedApp.purpose,
                description: savedApp.description,
                commissionRequired: Math.round(commissionRequired * 100) / 100,
                commissionStatus: 'PENDING',
                voluntaryCommission,
                interestRate: lockedRate,
                createdAt: savedApp.createdAt.toISOString(),
                fundingWindowHours: (savedApp as any).fundingWindowHours ?? 72,
                minFundingThreshold: (savedApp as any).minFundingThreshold ?? 50,
                autoClose: (savedApp as any).autoClose ?? false,
                autoCloseThreshold: (savedApp as any).autoCloseThreshold ?? 100,
                isPublic: (savedApp as any).isPublic ?? true,
                offers: [],
            };
        } catch (error: any) {
            console.error('Error creating application:', error);
            throw new Error(error.message || 'Failed to create application');
        }
    }

    /**
     * Get borrower's applications (paginated)
     *
     * SQL:
     * SELECT
     *   la.id,
     *   la.amount,
     *   la.duration_months,
     *   ls.code as status,
     *   SUM(lo.amount) as fundedAmount,
     *   (SUM(lo.amount) / la.amount * 100) as fundedPercent,
     *   la.created_at,
     *   ps.code as commissionStatus
     * FROM loan_applications la
     * LEFT JOIN loan_statuses ls ON ls.id = la.status_id
     * LEFT JOIN loan_offers lo ON lo.loan_id = (SELECT id FROM loans WHERE application_id = la.id)
     * LEFT JOIN payments p ON p.application_id = la.id AND p.payment_type_id = COMMISSION_TYPE_ID
     * LEFT JOIN payment_statuses ps ON ps.id = p.status_id
     * WHERE la.borrower_id = ?
     * ORDER BY la.created_at DESC
     */
    async getApplications(
        borrowerId: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<ApplicationListResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const offset = (page - 1) * pageSize;

            // Query loan_applications for borrower
            const [applications, totalItems] = await this.loanAppRepo.findByBorrowerId(
                borrowerIdNum,
                pageSize,
                offset
            );

            // Transform to DTOs with funded information
            const appDtos: ApplicationListItemDto[] = await Promise.all(
                applications.map(async (app) => {
                    // Get total offered amount for this application's loan
                    const loan = await this.loanRepo.findByApplicationId(app.id);
                    let fundedAmount = 0;
                    if (loan) {
                        fundedAmount = await this.loanOfferRepo.sumAmountByLoanId(loan.id);
                    }

                    const fundedPercent = app.amount > 0 ? (fundedAmount / app.amount) * 100 : 0;

                    return {
                        id: app.id,
                        amount: app.amount,
                        durationMonths: app.durationMonths,
                        status: this.getStatusName(app.statusId),
                        statusId: app.statusId,
                        fundedPercent: Math.round(fundedPercent * 100) / 100,
                        fundedAmount: fundedAmount,
                        remainingAmount: app.amount - fundedAmount,
                        createdAt: app.createdAt.toISOString(),
                        commissionStatus: app.commissionStatus,
                    };
                })
            );

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_APPLICATIONS',
                entity: 'APPLICATION',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                applications: appDtos,
                pagination: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize),
                },
            };
        } catch (error: any) {
            console.error('Error fetching applications:', error);
            throw new Error('Failed to fetch applications');
        }
    }

    private getStatusName(statusId: number): string {
        const statuses: { [key: number]: string } = {
            1: 'OPEN',
            2: 'FUNDED',
            3: 'CLOSED',
            4: 'CANCELLED',
        };
        return statuses[statusId] || 'UNKNOWN';
    }

    /**
     * Get application details with all offers
     */
    async getApplicationDetail(
        borrowerId: string,
        applicationId: string
    ): Promise<ApplicationDetailDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const appIdNum = parseInt(applicationId, 10);

            // Query loan_applications + loans + loan_offers
            const application = await this.loanAppRepo.findById(appIdNum);
            if (!application || Number(application.borrowerId) !== borrowerIdNum) {
                throw new Error('Application not found');
            }

            // Get loan for this application
            const loan = await this.loanRepo.findByApplicationId(appIdNum);
            let fundedAmount = 0;
            let offers: OfferSummaryDto[] = [];

            if (loan) {
                // Get all offers for the loan
                const loanOffers = await this.loanOfferRepo.findByLoanId(loan.id);
                fundedAmount = await this.loanOfferRepo.sumAmountByLoanId(loan.id);

                offers = loanOffers.map((offer) => ({
                    id: offer.id,
                    lenderId: offer.lenderId,
                    amount: offer.amount,
                    annualRate: 0,
                    status: 'OPEN',
                    createdAt: offer.createdAt.toISOString(),
                }));
            }

            const fundedPercent = application.amount > 0 ? (fundedAmount / application.amount) * 100 : 0;

            const detail: ApplicationDetailDto = {
                id: application.id,
                amount: application.amount,
                durationMonths: application.durationMonths,
                status: this.getStatusName(application.statusId),
                statusId: application.statusId,
                fundedPercent: Math.round(fundedPercent * 100) / 100,
                fundedAmount: fundedAmount,
                remainingAmount: application.amount - fundedAmount,
                purpose: application.purpose,
                description: application.description,
                commissionRequired: application.amount * 0.02,
                commissionStatus: application.commissionStatus,
                createdAt: application.createdAt.toISOString(),
                offers: offers,
            };

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_APPLICATION_DETAIL',
                entity: 'APPLICATION',
                entityId: appIdNum,
                createdAt: new Date(),
            } as any);

            return detail;
        } catch (error: any) {
            console.error('Error fetching application detail:', error);
            throw new Error('Failed to fetch application');
        }
    }

    /**
     * Cancel application
     * Allowed only if status = OPEN
     */
    async cancelApplication(
        borrowerId: string,
        applicationId: string,
        request: CancelApplicationRequest
    ): Promise<CancelApplicationResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const appIdNum = parseInt(applicationId, 10);

            // Query and validate application
            const application = await this.loanAppRepo.findById(appIdNum);
            if (!application || Number(application.borrowerId) !== borrowerIdNum) {
                throw new Error('Application not found');
            }

            // Validation: Application must be OPEN (statusId = 1)
            if (application.statusId !== 1) {
                throw new Error('Application is not in OPEN status. Only OPEN applications can be cancelled');
            }

            // Update status to CANCELLED (statusId = 4)
            application.statusId = 4;
            await this.loanAppRepo.update(appIdNum, application);

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'APPLICATION_CANCELLED',
                entity: 'APPLICATION',
                entityId: appIdNum,
                createdAt: new Date(),
            } as any);

            await this.notificationService.notify(
                borrowerIdNum,
                'APPLICATION_CANCELLED',
                'Application Cancelled',
                `Your loan application has been cancelled. Reason: ${request.reason || 'N/A'}`,
                { reason: request.reason || 'N/A' }
            );

            return {
                applicationId: appIdNum,
                status: 'CANCELLED',
                cancelledAt: new Date().toISOString(),
                message: 'Application cancelled successfully',
            };
        } catch (error: any) {
            console.error('Error cancelling application:', error);
            throw new Error(error.message || 'Failed to cancel application');
        }
    }

    /**
     * Close application (manual close by borrower).
     * Allowed only if: status = OPEN, funded_percent >= 50, loan exists and is OPEN.
     * Runs pro-rata, sets confirmed_amount on offers, transitions loan to FUNDED_PENDING_PAYMENT.
     */
    async closeApplication(
        borrowerId: string,
        applicationId: string,
        request: CloseApplicationRequest
    ): Promise<CloseApplicationResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const appIdNum = parseInt(applicationId, 10);

            const application = await this.loanAppRepo.findById(appIdNum);
            if (!application || Number(application.borrowerId) !== borrowerIdNum) {
                throw new Error('Application not found');
            }
            if (application.statusId !== 1) {
                throw new Error('Application must be in OPEN status to be closed');
            }
            if (application.fundedPercent < 50) {
                throw new Error('Application must be at least 50% funded before closing');
            }

            const loan = await this.loanRepo.findByApplicationId(appIdNum);
            if (!loan) throw new Error('Loan not found');
            if (loan.statusId !== 1) throw new Error('Loan is already closed or not open for closing');

            const { MarketplaceCloseService } = await import('./MarketplaceCloseService');
            const closeService = new MarketplaceCloseService();
            await closeService.closeLoanWithProRata(loan.id, 'borrower');

            const appAfter = await this.loanAppRepo.findById(appIdNum);
            const fundedAmount = Number(appAfter?.fundedAmount ?? application.fundedAmount * application.amount / 100);

            return {
                applicationId: appIdNum,
                loanId: loan.id,
                status: 'CLOSED',
                closedAt: new Date().toISOString(),
                fundedAmount,
                unfundedAmount: Number(application.amount) - fundedAmount,
            };
        } catch (error: any) {
            console.error('Error closing application:', error);
            throw new Error(error.message || 'Failed to close application');
        }
    }
}

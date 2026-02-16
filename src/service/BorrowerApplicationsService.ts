import { AuditLogRepository } from '../repository/AuditLogRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LmsNotificationService } from './LmsNotificationService';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { LevelRulesRepository } from '../repository/LevelRulesRepository';
import { UserRepository } from '../repository/UserRepository';
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

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationService = new LmsNotificationService();
        this.loanAppRepo = new LoanApplicationRepository();
        this.loanRepo = new LoanRepository();
        this.loanOfferRepo = new LoanOfferRepository();
        this.levelRulesRepo = new LevelRulesRepository();
        this.userRepo = new UserRepository();
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

            // Fetch level rules for the user's verification level
            const levelRules = await this.levelRulesRepo.findByLevel(user.level);
            if (!levelRules) {
                throw new Error('Verification level not configured');
            }

            // Validation 1: Amount within limits for verification level
            const maxAmount = levelRules.maxLoanAmount || 100000;
            const minAmount = levelRules.minAmount || 1000;
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
            const maxApplications = levelRules.maxApplications || 5;
            const activeCount = await this.loanAppRepo.countActiveByBorrower(borrowerIdNum);
            if (activeCount >= maxApplications) {
                throw new Error(`Maximum ${maxApplications} active applications allowed for your level`);
            }

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

            const savedApp = await this.loanAppRepo.save(application);

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

            const commissionRequired = request.amount * ((levelRules.commissionPercent || 2) / 100);

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
                commissionRequired: commissionRequired,
                commissionStatus: 'PENDING',
                createdAt: savedApp.createdAt.toISOString(),
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
            if (!application || application.borrowerId !== borrowerIdNum) {
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
            if (!application || application.borrowerId !== borrowerIdNum) {
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
     * Close application
     * Allowed only if:
     * - status = OPEN or FUNDED
     * - funded_percent >= 50
     * - At least one loan created from this application
     */
    async closeApplication(
        borrowerId: string,
        applicationId: string,
        request: CloseApplicationRequest
    ): Promise<CloseApplicationResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const appIdNum = parseInt(applicationId, 10);

            // Query and validate application
            const application = await this.loanAppRepo.findById(appIdNum);
            if (!application || application.borrowerId !== borrowerIdNum) {
                throw new Error('Application not found');
            }

            // Validation: Status must be OPEN (1) or FUNDED (2)
            if (![1, 2].includes(application.statusId)) {
                throw new Error('Application must be in OPEN or FUNDED status to be closed');
            }

            // Validation: funded_percent >= 50
            if (application.fundedPercent < 50) {
                throw new Error('Application must be at least 50% funded before closing');
            }

            // Update status to CLOSED (statusId = 3)
            application.statusId = 3;
            await this.loanAppRepo.update(appIdNum, application);

            const fundedAmount = (application.amount * application.fundedPercent) / 100;

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'APPLICATION_CLOSED',
                entity: 'APPLICATION',
                entityId: appIdNum,
                createdAt: new Date(),
            } as any);

            await this.notificationService.notify(
                borrowerIdNum,
                'APPLICATION_CLOSED',
                'Application Closed',
                `Your loan application has been successfully closed with ${application.fundedPercent}% funding`,
                { fundedPercent: String(application.fundedPercent) }
            );

            return {
                applicationId: appIdNum,
                status: 'CLOSED',
                closedAt: new Date().toISOString(),
                fundedAmount: fundedAmount,
                unfundedAmount: application.amount - fundedAmount,
            };
        } catch (error: any) {
            console.error('Error closing application:', error);
            throw new Error(error.message || 'Failed to close application');
        }
    }
}

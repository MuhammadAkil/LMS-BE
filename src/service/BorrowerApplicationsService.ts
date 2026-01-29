import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
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
    private notificationRepo: NotificationRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationRepo = new NotificationRepository();
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

            // Validation 1: Amount within limits for verification level
            // TODO: Query level_rules WHERE level = (SELECT level FROM users WHERE id = ?)
            // SELECT max_amount, min_amount FROM level_rules WHERE level = ?
            const maxAmount = 100000; // TODO: Fetch from level_rules
            if (request.amount > maxAmount) {
                throw new Error(`Loan amount cannot exceed ${maxAmount} for your verification level`);
            }

            // Validation 2: No duplicate OPEN applications
            // TODO: Query loan_applications WHERE borrower_id = ? AND status_id = OPEN_STATUS_ID
            // If exists, throw error

            // Transaction start
            const applicationId = Math.floor(Math.random() * 1000000);
            const commissionRequired = request.amount * 0.02; // 2% commission example

            // TODO: Insert into loan_applications
            // INSERT INTO loan_applications (borrower_id, amount, duration_months, purpose, description, status_id, created_at)
            // VALUES (?, ?, ?, ?, ?, OPEN_STATUS_ID, NOW())

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'APPLICATION_CREATED',
                entity: 'APPLICATION',
                entityId: applicationId,
                createdAt: new Date(),
            } as any);

            // Notification
            // TODO: Insert into notifications
            // notificationRepo.create({
            //   user_id: borrowerId,
            //   type: 'APPLICATION_CREATED',
            //   message: `Your loan application for ${amount} has been created`,
            // })

            return {
                id: applicationId,
                amount: request.amount,
                durationMonths: request.durationMonths,
                status: 'OPEN',
                statusId: 1,
                fundedPercent: 0,
                fundedAmount: 0,
                remainingAmount: request.amount,
                purpose: request.purpose,
                description: request.description,
                commissionRequired: commissionRequired,
                commissionStatus: 'PENDING',
                createdAt: new Date().toISOString(),
                offers: [],
            };
        } catch (error: any) {
            console.error('Error creating application:', error);
            // TODO: Transaction rollback
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

            // TODO: Query loan_applications for borrower
            const applications: ApplicationListItemDto[] = [];
            const totalItems = 0;

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_APPLICATIONS',
                entity: 'APPLICATION',
                entityId: 0,
                createdAt: new Date(),
            } as any);

            return {
                applications,
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

            // TODO: Query loan_applications + loans + loan_offers

            const detail: ApplicationDetailDto = {
                id: appIdNum,
                amount: 50000,
                durationMonths: 12,
                status: 'FUNDED',
                statusId: 2,
                fundedPercent: 100,
                fundedAmount: 50000,
                remainingAmount: 0,
                commissionRequired: 1000,
                commissionStatus: 'PAID',
                createdAt: new Date().toISOString(),
                offers: [],
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
     *
     * ATOMIC TRANSACTION:
     * BEGIN
     *   UPDATE loan_applications SET status_id = CANCELLED_STATUS_ID, updated_at = NOW()
     *   WHERE id = ? AND status_id = OPEN_STATUS_ID
     *   INSERT INTO audit_logs (action='APPLICATION_CANCELLED', ...)
     * COMMIT
     */
    async cancelApplication(
        borrowerId: string,
        applicationId: string,
        request: CancelApplicationRequest
    ): Promise<CancelApplicationResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const appIdNum = parseInt(applicationId, 10);

            // Validation: Application must be OPEN
            // TODO: Query loan_applications WHERE id = ? AND status_id = OPEN_STATUS_ID
            // If not found, throw 'Application is not in OPEN status'

            // TODO: Update status to CANCELLED
            // UPDATE loan_applications SET status_id = CANCELLED_STATUS_ID WHERE id = ?

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'APPLICATION_CANCELLED',
                entity: 'APPLICATION',
                entityId: appIdNum,
                createdAt: new Date(),
            } as any);

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
     *
     * SQL:
     * UPDATE loan_applications SET status_id = CLOSED_STATUS_ID, updated_at = NOW()
     * WHERE id = ? AND funded_percent >= 50
     */
    async closeApplication(
        borrowerId: string,
        applicationId: string,
        request: CloseApplicationRequest
    ): Promise<CloseApplicationResponse> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const appIdNum = parseInt(applicationId, 10);

            // Validation: funded_percent >= 50
            // TODO: Query loan_applications for funded_percent
            // If < 50, throw error

            // TODO: Update status to CLOSED

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'APPLICATION_CLOSED',
                entity: 'APPLICATION',
                entityId: appIdNum,
                createdAt: new Date(),
            } as any);

            return {
                applicationId: appIdNum,
                status: 'CLOSED',
                closedAt: new Date().toISOString(),
                fundedAmount: 50000,
                unfundedAmount: 0,
            };
        } catch (error: any) {
            console.error('Error closing application:', error);
            throw new Error(error.message || 'Failed to close application');
        }
    }
}

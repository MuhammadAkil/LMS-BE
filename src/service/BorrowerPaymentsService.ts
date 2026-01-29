import { AuditLogRepository } from '../repository/AuditLogRepository';
import { NotificationRepository } from '../repository/NotificationRepository';
import {
    InitiateCommissionPaymentRequest,
    CommissionPaymentStatusDto,
} from '../dto/BorrowerDtos';

/**
 * B-04: BORROWER PAYMENTS SERVICE
 * Handles commission payments and payment tracking
 *
 * Rules:
 * - payment_type = COMMISSION (from payment_types lookup)
 * - provider = PRZELEWY24 (configurable)
 * - Payment status must be PAID before loan activation
 * - Cannot activate loan without paid commission
 */
export class BorrowerPaymentsService {
    private auditRepo: AuditLogRepository;
    private notificationRepo: NotificationRepository;

    constructor() {
        this.auditRepo = new AuditLogRepository();
        this.notificationRepo = new NotificationRepository();
    }

    /**
     * Initiate commission payment
     * Creates payment record and returns payment gateway redirect URL
     *
     * ATOMIC TRANSACTION:
     * BEGIN
     *   INSERT INTO payments (
     *     borrower_id, application_id, payment_type_id, provider_id, 
     *     amount, status_id, return_url, created_at
     *   ) VALUES (?, ?, COMMISSION_TYPE_ID, PROVIDER_ID, ?, PENDING_STATUS_ID, ?, NOW())
     *   INSERT INTO audit_logs (action='COMMISSION_PAYMENT_INITIATED', ...)
     * COMMIT
     *
     * Response includes:
     * - redirectUrl: Payment gateway link (Przelewy24)
     * - paymentId: Database payment record ID
     */
    async initiateCommissionPayment(
        borrowerId: string,
        request: InitiateCommissionPaymentRequest
    ): Promise<{ redirectUrl: string; paymentId: number }> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const appIdNum = parseInt(request.applicationId, 10);

            // Validation: Application must exist and belong to borrower
            // TODO: Query loan_applications WHERE id = ? AND borrower_id = ?

            // Calculate commission amount
            // TODO: Query loan_applications for amount
            // const commissionAmount = applicationAmount * COMMISSION_RATE; // e.g., 2%
            const commissionAmount = 1000; // Placeholder

            // TODO: Create payment record
            const paymentId = Math.floor(Math.random() * 1000000);

            // TODO: Call payment gateway (Przelewy24)
            // const redirectUrl = await this.paymentGateway.initiate({
            //   amount: commissionAmount,
            //   currency: 'PLN',
            //   description: `Commission for loan application ${appIdNum}`,
            //   returnUrl: request.returnUrl || `${process.env.APP_URL}/api/payments/callback`,
            //   externalId: paymentId,
            // });

            const redirectUrl = `https://secure.przelewy24.pl/checkout?sessionId=SESSION_${paymentId}`;

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'COMMISSION_PAYMENT_INITIATED',
                entity: 'PAYMENT',
                entityId: paymentId,
                createdAt: new Date(),
            } as any);

            return {
                redirectUrl,
                paymentId,
            };
        } catch (error: any) {
            console.error('Error initiating commission payment:', error);
            throw new Error('Failed to initiate payment');
        }
    }

    /**
     * Get payment status
     *
     * SQL:
     * SELECT
     *   p.id,
     *   p.application_id,
     *   p.amount,
     *   ps.code as status,
     *   pt.code as payment_type,
     *   pp.code as payment_provider,
     *   p.created_at,
     *   p.updated_at as completedAt,
     *   p.failure_reason
     * FROM payments p
     * JOIN payment_statuses ps ON ps.id = p.status_id
     * JOIN payment_types pt ON pt.id = p.payment_type_id
     * JOIN payment_providers pp ON pp.id = p.provider_id
     * WHERE p.id = ? AND p.borrower_id = ?
     */
    async getPaymentStatus(
        borrowerId: string,
        paymentId: string
    ): Promise<CommissionPaymentStatusDto> {
        try {
            const borrowerIdNum = parseInt(borrowerId, 10);
            const paymentIdNum = parseInt(paymentId, 10);

            // TODO: Query payments table
            const payment: CommissionPaymentStatusDto = {
                paymentId: paymentIdNum,
                applicationId: 1,
                amount: 1000,
                status: 'PAID',
                paymentMethod: 'PRZELEWY24',
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            };

            // Audit log
            await this.auditRepo.create({
                actorId: borrowerIdNum,
                action: 'VIEW_PAYMENT_STATUS',
                entity: 'PAYMENT',
                entityId: paymentIdNum,
                createdAt: new Date(),
            } as any);

            return payment;
        } catch (error: any) {
            console.error('Error fetching payment status:', error);
            throw new Error('Failed to fetch payment status');
        }
    }

    /**
     * Payment gateway callback handler
     * Called by Przelewy24 after payment success/failure
     *
     * ATOMIC TRANSACTION:
     * BEGIN
     *   UPDATE payments SET status_id = PAID_STATUS_ID, updated_at = NOW()
     *   WHERE id = ? AND amount = ? AND signature = SHA1(...)
     *   INSERT INTO audit_logs (...)
     *   INSERT INTO notifications (user_id=borrower_id, type='PAYMENT_SUCCESSFUL', ...)
     * COMMIT
     *
     * Signature validation:
     * SHA1(sessionId|amount|currency|crc|KEY) must match provided signature
     */
    async handlePaymentCallback(
        paymentId: number,
        status: string,
        signature: string,
        amount: number
    ): Promise<void> {
        try {
            // Validate signature
            // TODO: const expectedSignature = SHA1(`${paymentId}|${amount}|PLN|CRC|${process.env.PAYMENT_KEY}`)
            // if (signature !== expectedSignature) throw new Error('Invalid signature')

            // TODO: Update payment record
            // UPDATE payments SET status_id = PAID_STATUS_ID WHERE id = ? AND amount = ?

            // Audit log
            // TODO: this.auditRepo.create({...})

            // Notification
            // TODO: Notify borrower of successful payment

            // Update any related loan status
            // If loan_applications.commission_status was PENDING, now set to PAID
            // TODO: UPDATE loan_applications SET commission_status = 'PAID' WHERE commission_payment_id = ?
        } catch (error: any) {
            console.error('Error handling payment callback:', error);
            // Log failed callback for investigation
            // TODO: Create error record for retry
            throw error;
        }
    }
}

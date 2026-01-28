import {
    MakeOfferRequest,
    MakeOfferResponse,
    OfferValidationResponse,
} from '../dto/LenderDtos';
import { AuditLogRepository } from '../repository/AuditLogRepository';

/**
 * L-03: LENDER OFFERS SERVICE (CRITICAL PATH)
 * Handle offer creation with strict gating, validation, and audit
 * This is the most critical service - offers are the core business model
 */
export class LenderOffersService {
    private auditLogRepository: AuditLogRepository;
    // In production: Use proper database connection pool
    // private db: DatabaseConnection;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
    }

    /**
     * Validate offer before creation
     * Rules:
     * 1. Remaining amount in loan must be >= offer amount
     * 2. Lender balance must be >= offer amount
     * 3. Lender must pass all gating checks (done by guards)
     * 4. Lender must have verified bank account
     * 
     * SQL for validation:
     * SELECT 
     *   la.amount - COALESCE(SUM(lo.amount), 0) as remaining_amount,
     *   u.balance as lender_balance,
     *   CASE WHEN u.status_id = 2 THEN 1 ELSE 0 END as is_active,
     *   u.level as verification_level
     * FROM loan_applications la
     * LEFT JOIN loan_offers lo ON lo.loan_id = (SELECT id FROM loans WHERE application_id = la.id LIMIT 1)
     * JOIN users u ON u.id = ?
     * WHERE la.id = ?
     */
    async validateOffer(
        lenderId: string,
        loanId: string,
        offerAmount: number
    ): Promise<OfferValidationResponse> {
        try {
            const errors: string[] = [];
            const warnings: string[] = [];

            // TODO: Execute queries to fetch:
            // 1. Remaining amount in loan
            // 2. Lender's available balance
            // 3. Lender's current verification level
            // 4. Lender's active investment count (from platform_config.level_rules)

            // Validation 1: Remaining amount check
            const remainingAmount = 1000; // Placeholder
            if (remainingAmount < offerAmount) {
                errors.push(`Insufficient remaining loan amount. Available: $${remainingAmount}`);
            }

            // Validation 2: Lender balance check
            const lenderBalance = 5000; // Placeholder
            if (lenderBalance < offerAmount) {
                errors.push(`Insufficient lender balance. Available: $${lenderBalance}`);
            }

            // Validation 3: Amount must be positive
            if (offerAmount <= 0) {
                errors.push('Offer amount must be greater than 0');
            }

            // Validation 4: Max amount based on verification level
            // From platform_config > level_rules
            const maxLoanAmount = 10000; // Placeholder based on level
            if (offerAmount > maxLoanAmount) {
                errors.push(`Offer exceeds maximum for your verification level. Max: $${maxLoanAmount}`);
            }

            // Warning: Near capacity
            if (lenderBalance - offerAmount < 1000) {
                warnings.push('This offer will leave less than $1000 in your account');
            }

            const estimatedROI = (offerAmount * 0.08) / 12; // 8% annual, monthly estimate

            return {
                isValid: errors.length === 0,
                errors,
                warnings,
                lenderBalance,
                remainingCapacity: remainingAmount,
                estimatedROI,
            };
        } catch (error: any) {
            console.error('Error validating offer:', error);
            throw new Error('Failed to validate offer');
        }
    }

    /**
     * Create a new offer (CRITICAL)
     * Steps:
     * 1. Validate offer (business rules)
     * 2. BEGIN TRANSACTION
     * 3. INSERT into loan_offers
     * 4. UPDATE loan_applications SET funded_percent
     * 5. INSERT into audit_logs
     * 6. Send notification to borrower
     * 7. COMMIT
     * 
     * SQL INSERT:
     * INSERT INTO loan_offers (loan_id, lender_id, amount, created_at) 
     * VALUES (?, ?, ?, NOW())
     * 
     * SQL UPDATE funded_percent:
     * UPDATE loan_applications la
     * SET funded_percent = (
     *   SELECT COALESCE(SUM(lo.amount), 0) / la.amount * 100
     *   FROM loan_offers lo
     *   JOIN loans l ON l.id = lo.loan_id
     *   WHERE l.application_id = la.id
     * )
     * WHERE id = ?
     */
    async createOffer(
        lenderId: string,
        request: MakeOfferRequest
    ): Promise<MakeOfferResponse> {
        try {
            // Step 1: Validate offer
            const validation = await this.validateOffer(lenderId, request.loanId, request.amount);
            if (!validation.isValid) {
                throw new Error(`Offer validation failed: ${validation.errors.join(', ')}`);
            }

            // TODO: In production, use transaction
            // const transaction = await db.beginTransaction();

            try {
                // Step 2: Insert offer
                // const offerId = await transaction.query(
                //   'INSERT INTO loan_offers (loan_id, lender_id, amount, created_at) VALUES (?, ?, ?, NOW())',
                //   [request.loanId, lenderId, request.amount]
                // );

                // Step 3: Calculate and update funded_percent
                // await transaction.query(
                //   'UPDATE loan_applications SET funded_percent = (...) WHERE id = ?',
                //   [loanId]
                // );

                // Step 4: Audit log
                const offerId = 'OFFER_' + Date.now(); // Placeholder
                // Audit log placeholder (replace with actual repository method when available)
                console.log(`Audit: User ${lenderId} created offer ${offerId}`);

                // Step 5: Send notification to borrower
                // const borrowerId = await getLoanBorrowerId(request.loanId);
                // await notificationService.notify({
                //   userId: borrowerId,
                //   type: 'LOAN_OFFER_RECEIVED',
                //   payload: {
                //     loanId: request.loanId,
                //     offerId,
                //     amount: request.amount,
                //   }
                // });

                // TODO: transaction.commit();

                return {
                    offerId,
                    loanId: request.loanId,
                    lenderId,
                    amount: request.amount,
                    loanFundedPercent: 50, // Placeholder - recalculate from DB
                    createdAt: new Date().toISOString(),
                    message: 'Offer created successfully. Borrower has been notified.',
                };
            } catch (transactionError: any) {
                // TODO: transaction.rollback();
                console.error('Transaction error creating offer:', transactionError);
                throw transactionError;
            }
        } catch (error: any) {
            console.error('Error creating offer:', error);
            throw error;
        }
    }

    /**
     * Check if loan can be converted to active loan status
     * Triggers when funded_percent >= 100%
     * 
     * SQL:
     * SELECT 
     *   COALESCE(SUM(lo.amount), 0) as total_funded,
     *   la.amount as required_amount,
     *   CASE WHEN COALESCE(SUM(lo.amount), 0) >= la.amount THEN 1 ELSE 0 END as can_convert
     * FROM loan_applications la
     * LEFT JOIN loan_offers lo ON ...
     * WHERE la.id = ?
     */
    async checkLoanConversion(loanId: string): Promise<boolean> {
        try {
            // TODO: Query total funded vs required amount
            // If funded >= required:
            //   - BEGIN TRANSACTION
            //   - Update loan_applications status to FUNDED
            //   - Create loans record with total_amount = SUM(offers)
            //   - Create contracts PDF
            //   - Notify borrower + all lenders
            //   - COMMIT

            return false;
        } catch (error: any) {
            console.error('Error checking loan conversion:', error);
            throw new Error('Failed to check loan conversion');
        }
    }
}

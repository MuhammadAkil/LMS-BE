import {
    MakeOfferRequest,
    MakeOfferResponse,
    OfferValidationResponse,
    PendingDelegatedOfferDto,
    DelegatedOfferActionResponse,
} from '../dto/LenderDtos';
import { LoanRepository } from '../repository/LoanRepository';
import { LoanApplicationRepository } from '../repository/LoanApplicationRepository';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { AuditLogRepository } from '../repository/AuditLogRepository';
import { PaymentRepository } from '../repository/PaymentRepository';
import { UserRepository } from '../repository/UserRepository';
import { AppDataSource } from '../config/database';
import { LoanOffer } from '../domain/LoanOffer';
import { Payment } from '../domain/Payment';
import { LmsNotificationService } from './LmsNotificationService';
import { Przelewy24Service } from './Przelewy24Service';
import { randomUUID } from 'crypto';
import config from '../config/Config';

const MIN_OFFER_PLN = 10;
const DELEGATED_APPROVAL_WINDOW_HOURS = 24;
const DELEGATED_PAYMENT_WINDOW_HOURS = 2;
const STATUS_PENDING = 1;
const STATUS_PAID = 2;
const PROVIDER_P24 = 1;
const PAYMENT_TYPE_VOLUNTARY_COMMISSION = 4;
const PAYMENT_STEP_DELEGATED_MANAGEMENT_FEE = 'DELEGATED_LENDER_MANAGEMENT_FEE';

/**
 * L-03: LENDER OFFERS SERVICE (CRITICAL PATH)
 * Min 10 PLN enforced; remaining amount from DB; atomic create/cancel
 */
export class LenderOffersService {
    private auditLogRepository: AuditLogRepository;
    private loanRepo: LoanRepository;
    private loanAppRepo: LoanApplicationRepository;
    private loanOfferRepo: LoanOfferRepository;
    private notificationService: LmsNotificationService;
    private paymentRepo: PaymentRepository;
    private userRepo: UserRepository;
    private p24: Przelewy24Service;
    private delegatedColumnsChecked = false;
    private delegatedColumnsAvailable = false;

    constructor() {
        this.auditLogRepository = new AuditLogRepository();
        this.loanRepo = new LoanRepository();
        this.loanAppRepo = new LoanApplicationRepository();
        this.loanOfferRepo = new LoanOfferRepository();
        this.notificationService = new LmsNotificationService();
        this.paymentRepo = new PaymentRepository();
        this.userRepo = new UserRepository();
        this.p24 = new Przelewy24Service();
    }

    private async recalculateLoanFunding(loanId: number): Promise<void> {
        const loan = await this.loanRepo.findById(loanId);
        if (!loan) throw new Error('Loan not found');
        const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loanId);
        const totalAmount = Number(loan.totalAmount);
        const fundedAmount = Math.min(totalOffered, totalAmount);
        const fundedPercent = totalAmount > 0 ? (fundedAmount / totalAmount) * 100 : 0;
        await this.loanRepo.update(loanId, { fundedAmount } as any);
        await this.loanAppRepo.update(loan.applicationId, { fundedAmount, fundedPercent } as any);
    }

    private async ensureDelegatedColumnsAvailability(): Promise<boolean> {
        if (this.delegatedColumnsChecked) {
            return this.delegatedColumnsAvailable;
        }
        const rows = await AppDataSource.query(
            `SELECT COUNT(*) AS cnt
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'loan_offers'
               AND COLUMN_NAME IN (
                    'updatedAt',
                    'delegated_by_company_id',
                    'delegated_status',
                    'delegated_approval_expires_at',
                    'delegated_approved_at',
                    'delegated_payment_due_at',
                    'delegated_payment_status',
                    'delegated_paid_at',
                    'delegated_commission_amount'
               )`
        );
        const cnt = Number(rows?.[0]?.cnt ?? 0);
        this.delegatedColumnsAvailable = cnt >= 9;
        this.delegatedColumnsChecked = true;
        return this.delegatedColumnsAvailable;
    }

    private async expireDelegatedOffers(): Promise<void> {
        if (!(await this.ensureDelegatedColumnsAvailability())) {
            return;
        }
        try {
            await AppDataSource.query(
                `UPDATE loan_offers
                 SET delegated_status = 'EXPIRED',
                     delegated_payment_status = COALESCE(delegated_payment_status, 'UNPAID'),
                     updatedAt = NOW()
                 WHERE delegated_status = 'PENDING_LENDER_APPROVAL'
                   AND delegated_approval_expires_at IS NOT NULL
                   AND delegated_approval_expires_at < NOW()`
            );
            await AppDataSource.query(
                `UPDATE loan_offers
                 SET delegated_status = 'EXPIRED',
                     delegated_payment_status = 'UNPAID',
                     updatedAt = NOW()
                 WHERE delegated_status = 'PENDING_LENDER_PAYMENT'
                   AND delegated_payment_due_at IS NOT NULL
                   AND delegated_payment_due_at < NOW()`
            );
        } catch (error: any) {
            const msg = String(error?.message ?? '');
            if (msg.includes('Unknown column')) {
                this.delegatedColumnsAvailable = false;
                this.delegatedColumnsChecked = true;
                return;
            }
            throw error;
        }
    }

    async createDelegatedOffer(
        companyId: number,
        userId: number,
        request: { loanId: string; lenderId: number; amount: number }
    ): Promise<{ offerId: string; status: string; approvalExpiresAt: string; commissionAmount: number }> {
        if (!(await this.ensureDelegatedColumnsAvailability())) {
            throw new Error('Delegated offer flow is unavailable: required DB columns are missing');
        }
        await this.expireDelegatedOffers();

        if (request.amount < MIN_OFFER_PLN) {
            throw new Error(`Minimum offer is ${MIN_OFFER_PLN} PLN`);
        }
        const loanIdNum = parseInt(request.loanId, 10);
        if (!Number.isInteger(loanIdNum) || loanIdNum <= 0) {
            throw new Error('Invalid loan ID');
        }

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const linked = await queryRunner.query(
                `SELECT cl.active, cl.amountLimit, c.conditions_json, c.commission_pct
                 FROM company_lenders cl
                 INNER JOIN companies c ON c.id = cl.companyId
                 WHERE cl.companyId = ? AND cl.lenderId = ?
                 LIMIT 1`,
                [companyId, request.lenderId]
            );
            if (!linked || linked.length === 0) {
                throw new Error('Lender is not linked to this company');
            }
            if (!linked[0].active) {
                throw new Error('Lender link is inactive');
            }
            if (request.amount > Number(linked[0].amountLimit || 0)) {
                throw new Error('Amount exceeds configured lender limit');
            }

            const loan = await this.loanRepo.findById(loanIdNum);
            if (!loan) throw new Error('Loan not found');
            if (loan.statusId !== 1) throw new Error('Loan is not open for offers');

            const existing = await queryRunner.query(
                `SELECT id
                 FROM loan_offers
                 WHERE loanId = ? AND lenderId = ?
                   AND (delegated_status IS NULL
                        OR delegated_status IN ('PENDING_LENDER_APPROVAL', 'PENDING_LENDER_PAYMENT', 'ACTIVE'))
                 LIMIT 1`,
                [loanIdNum, request.lenderId]
            );
            if (existing && existing.length > 0) {
                throw new Error('Lender already has an active or pending offer on this loan');
            }

            let rate = Number(linked[0].commission_pct ?? 0);
            try {
                const parsed = typeof linked[0].conditions_json === 'string'
                    ? JSON.parse(linked[0].conditions_json || '{}')
                    : (linked[0].conditions_json || {});
                rate = Number(parsed.managementCommissionRate ?? rate);
            } catch { }
            const commissionAmount = Math.round(request.amount * (rate / 100) * 100) / 100;
            const approvalExpiresAt = new Date(Date.now() + DELEGATED_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000);

            const offer = new LoanOffer();
            offer.loanId = loanIdNum;
            offer.lenderId = request.lenderId;
            offer.amount = request.amount;
            offer.delegatedByCompanyId = companyId;
            offer.delegatedStatus = 'PENDING_LENDER_APPROVAL';
            offer.delegatedApprovalExpiresAt = approvalExpiresAt;
            offer.delegatedPaymentStatus = 'UNPAID';
            offer.delegatedCommissionAmount = commissionAmount;
            const saved = await this.loanOfferRepo.save(offer);

            await this.auditLogRepository.create({
                actorId: userId,
                action: 'DELEGATED_OFFER_CREATED',
                entity: 'LOAN_OFFER',
                entityId: saved.id,
                createdAt: new Date(),
            } as any);

            await this.notificationService.notify(
                request.lenderId,
                'DELEGATED_OFFER_PENDING_APPROVAL',
                'Delegated Offer Pending Approval',
                `A company has submitted an offer of ${request.amount.toFixed(2)} PLN for your approval.`,
                {
                    loanId: String(loanIdNum),
                    offerId: String(saved.id),
                    approvalExpiresAt: approvalExpiresAt.toISOString(),
                }
            );

            await queryRunner.commitTransaction();

            return {
                offerId: String(saved.id),
                status: 'PENDING_LENDER_APPROVAL',
                approvalExpiresAt: approvalExpiresAt.toISOString(),
                commissionAmount,
            };
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }

    async listPendingDelegatedOffers(lenderId: string): Promise<PendingDelegatedOfferDto[]> {
        if (!(await this.ensureDelegatedColumnsAvailability())) {
            return [];
        }
        await this.expireDelegatedOffers();
        const lenderIdNum = parseInt(lenderId, 10);
        const rows = await AppDataSource.query(
            `SELECT
                lo.id,
                lo.loanId,
                lo.amount,
                lo.delegated_status AS delegatedStatus,
                lo.delegated_approval_expires_at AS approvalExpiresAt,
                lo.delegated_payment_due_at AS paymentDueAt,
                lo.delegated_commission_amount AS commissionAmount,
                lo.createdAt,
                c.id AS companyId,
                c.name AS companyName
             FROM loan_offers lo
             INNER JOIN companies c ON c.id = lo.delegated_by_company_id
             WHERE lo.lenderId = ?
               AND lo.delegated_status IN ('PENDING_LENDER_APPROVAL', 'PENDING_LENDER_PAYMENT')
             ORDER BY lo.createdAt DESC`,
            [lenderIdNum]
        );

        return (rows || []).map((r: any) => ({
            offerId: String(r.id),
            loanId: String(r.loanId),
            companyId: Number(r.companyId),
            companyName: r.companyName,
            amount: Number(r.amount),
            commissionAmount: Number(r.commissionAmount ?? 0),
            status: r.delegatedStatus,
            createdAt: new Date(r.createdAt).toISOString(),
            approvalExpiresAt: r.approvalExpiresAt ? new Date(r.approvalExpiresAt).toISOString() : undefined,
            paymentDueAt: r.paymentDueAt ? new Date(r.paymentDueAt).toISOString() : undefined,
        }));
    }

    async approveDelegatedOffer(lenderId: string, offerId: string): Promise<DelegatedOfferActionResponse> {
        if (!(await this.ensureDelegatedColumnsAvailability())) {
            throw new Error('Delegated offer flow is unavailable: required DB columns are missing');
        }
        await this.expireDelegatedOffers();
        const lenderIdNum = parseInt(lenderId, 10);
        const offerIdNum = parseInt(offerId, 10);
        const offer = await this.loanOfferRepo.findById(offerIdNum);
        if (!offer || offer.lenderId !== lenderIdNum) throw new Error('Offer not found');
        if (offer.delegatedStatus !== 'PENDING_LENDER_APPROVAL') throw new Error('Offer is not pending lender approval');

        const paymentDueAt = new Date(Date.now() + DELEGATED_PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);
        await AppDataSource.query(
            `UPDATE loan_offers
             SET delegated_status = 'PENDING_LENDER_PAYMENT',
                 delegated_approved_at = NOW(),
                 delegated_payment_due_at = ?,
                 updatedAt = NOW()
             WHERE id = ?`,
            [paymentDueAt, offerIdNum]
        );

        await this.auditLogRepository.create({
            actorId: lenderIdNum,
            action: 'DELEGATED_OFFER_APPROVED',
            entity: 'LOAN_OFFER',
            entityId: offerIdNum,
            createdAt: new Date(),
        } as any);

        return {
            offerId,
            status: 'PENDING_LENDER_PAYMENT',
            message: 'Delegated offer approved. Complete platform payment within 2 hours.',
            paymentDueAt: paymentDueAt.toISOString(),
            commissionAmount: Number(offer.delegatedCommissionAmount ?? 0),
        };
    }

    async rejectDelegatedOffer(lenderId: string, offerId: string): Promise<DelegatedOfferActionResponse> {
        if (!(await this.ensureDelegatedColumnsAvailability())) {
            throw new Error('Delegated offer flow is unavailable: required DB columns are missing');
        }
        await this.expireDelegatedOffers();
        const lenderIdNum = parseInt(lenderId, 10);
        const offerIdNum = parseInt(offerId, 10);
        const offer = await this.loanOfferRepo.findById(offerIdNum);
        if (!offer || offer.lenderId !== lenderIdNum) throw new Error('Offer not found');
        if (offer.delegatedStatus !== 'PENDING_LENDER_APPROVAL') throw new Error('Offer is not pending lender approval');

        await AppDataSource.query(
            `UPDATE loan_offers
             SET delegated_status = 'REJECTED',
                 delegated_payment_status = 'REJECTED',
                 updatedAt = NOW()
             WHERE id = ?`,
            [offerIdNum]
        );

        await this.auditLogRepository.create({
            actorId: lenderIdNum,
            action: 'DELEGATED_OFFER_REJECTED',
            entity: 'LOAN_OFFER',
            entityId: offerIdNum,
            createdAt: new Date(),
        } as any);

        return {
            offerId,
            status: 'REJECTED',
            message: 'Delegated offer rejected and lock released.',
        };
    }

    async payDelegatedOffer(lenderId: string, offerId: string): Promise<DelegatedOfferActionResponse> {
        if (!(await this.ensureDelegatedColumnsAvailability())) {
            throw new Error('Delegated offer flow is unavailable: required DB columns are missing');
        }
        await this.expireDelegatedOffers();
        const lenderIdNum = parseInt(lenderId, 10);
        const offerIdNum = parseInt(offerId, 10);
        const offer = await this.loanOfferRepo.findById(offerIdNum);
        if (!offer || offer.lenderId !== lenderIdNum) throw new Error('Offer not found');
        if (offer.delegatedStatus !== 'PENDING_LENDER_PAYMENT') throw new Error('Offer is not pending lender payment');
        if (!offer.delegatedPaymentDueAt || new Date(offer.delegatedPaymentDueAt).getTime() < Date.now()) {
            throw new Error('Payment window has expired');
        }

        const lender = await this.userRepo.findById(lenderIdNum);
        if (!lender?.email) throw new Error('Lender email not found');

        const sessionId = randomUUID();
        const appBaseUrl = (config as any).app?.baseUrl ?? 'http://localhost:3009';
        const frontendBaseUrl = (config as any).app?.frontendUrl || appBaseUrl;
        const commissionAmount = Number(offer.delegatedCommissionAmount ?? 0);
        const totalAmount = Number(offer.amount) + commissionAmount;
        const totalAmountGrosz = Math.round(totalAmount * 100);

        const payment = new Payment();
        payment.userId = lenderIdNum;
        payment.loanId = offer.loanId;
        payment.paymentTypeId = PAYMENT_TYPE_VOLUNTARY_COMMISSION;
        payment.providerId = PROVIDER_P24;
        payment.statusId = STATUS_PENDING;
        payment.amount = totalAmount;
        payment.sessionId = sessionId;
        payment.paymentStep = PAYMENT_STEP_DELEGATED_MANAGEMENT_FEE;
        payment.delegatedOfferId = offerIdNum;
        const savedPayment = await this.paymentRepo.save(payment);

        const urlReturn = `${frontendBaseUrl}/payment/delegated-success?sessionId=${sessionId}&offerId=${offerId}`;
        const urlStatus = `${appBaseUrl.replace(/\/$/, '')}/webhook/p24`;

        const registered = await this.p24.registerTransaction({
            sessionId,
            amount: totalAmountGrosz,
            currency: 'PLN',
            description: `Delegated lender payment - Offer #${offerId}`,
            email: lender.email,
            country: 'PL',
            urlReturn,
            urlStatus,
        });

        await this.auditLogRepository.create({
            actorId: lenderIdNum,
            action: 'DELEGATED_OFFER_PAYMENT_INITIATED',
            entity: 'LOAN_OFFER',
            entityId: offerIdNum,
            createdAt: new Date(),
        } as any);

        return {
            offerId,
            status: 'PENDING_LENDER_PAYMENT',
            message: 'Redirecting to Przelewy24. Offer activates after verified webhook confirmation.',
            paymentDueAt: offer.delegatedPaymentDueAt ? new Date(offer.delegatedPaymentDueAt).toISOString() : undefined,
            commissionAmount,
            paymentId: savedPayment.id,
            sessionId,
            redirectUrl: this.p24.getRedirectUrl(registered.token),
        };
    }

    async handleDelegatedPaymentWebhook(
        sessionId: string,
        orderId: number,
        amount: number,
        currency: string,
        sign: string
    ): Promise<void> {
        const payment = await this.paymentRepo.findBySessionId(sessionId);
        if (!payment) throw new Error(`Payment not found for sessionId: ${sessionId}`);
        if (payment.paymentStep !== PAYMENT_STEP_DELEGATED_MANAGEMENT_FEE) {
            throw new Error('Payment step is not delegated lender management fee');
        }
        if (!payment.delegatedOfferId) {
            throw new Error('Delegated offer ID missing in payment');
        }

        if (payment.statusId === STATUS_PAID) {
            return;
        }

        const amountGrosz = Number(amount);
        const expectedAmount = Math.round(Number(payment.amount) * 100);
        if (amountGrosz !== expectedAmount) {
            throw new Error(`Amount mismatch: expected ${expectedAmount}, got ${amountGrosz}`);
        }

        const isValid = this.p24.verifyWebhookSign(sessionId, orderId, amountGrosz, currency ?? 'PLN', sign);
        if (!isValid) throw new Error('Invalid webhook signature');

        await this.p24.verifyTransaction({
            sessionId,
            amount: amountGrosz,
            currency: currency ?? 'PLN',
            orderId,
        });

        await this.paymentRepo.update(payment.id as number, {
            statusId: STATUS_PAID,
            paidAt: new Date(),
            providerOrderId: String(orderId),
        });

        const offerIdNum = Number(payment.delegatedOfferId);
        const offer = await this.loanOfferRepo.findById(offerIdNum);
        if (!offer) throw new Error('Delegated offer not found');

        // Idempotent guard for repeated webhook deliveries
        if (offer.delegatedStatus === 'ACTIVE' && offer.delegatedPaymentStatus === 'PAID') {
            return;
        }

        await AppDataSource.query(
            `UPDATE loan_offers
             SET delegated_status = 'ACTIVE',
                 delegated_payment_status = 'PAID',
                 delegated_paid_at = NOW(),
                 updatedAt = NOW()
             WHERE id = ?`,
            [offerIdNum]
        );

        await this.recalculateLoanFunding(offer.loanId);

        await this.auditLogRepository.create({
            actorId: payment.userId,
            action: 'DELEGATED_OFFER_PAID',
            entity: 'LOAN_OFFER',
            entityId: offerIdNum,
            createdAt: new Date(),
        } as any);

        if (offer.delegatedByCompanyId) {
            await this.notificationService.notify(
                Number(offer.delegatedByCompanyId),
                'DELEGATED_OFFER_PAID',
                'Delegated Offer Paid',
                `Lender completed payment for delegated offer #${offerIdNum}. Offer is now ACTIVE.`,
                { offerId: String(offerIdNum), loanId: String(offer.loanId) }
            );
        }
    }

    async validateOffer(
        lenderId: string,
        loanId: string,
        offerAmount: number
    ): Promise<OfferValidationResponse> {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (offerAmount < MIN_OFFER_PLN) {
            errors.push(`Minimum offer is ${MIN_OFFER_PLN} PLN`);
        }
        if (offerAmount <= 0) {
            errors.push('Offer amount must be greater than 0');
        }

        const loanIdNum = parseInt(loanId, 10);
        const loan = await this.loanRepo.findById(loanIdNum);
        if (!loan) {
            errors.push('Loan not found');
            return { isValid: false, errors, warnings, remainingCapacity: 0, estimatedROI: 0 };
        }
        if (loan.statusId !== 1) {
            errors.push('Loan is not open for offers');
            return { isValid: false, errors, warnings, remainingCapacity: 0, estimatedROI: 0 };
        }

        const existingOffer = await this.loanOfferRepo.findByLoanIdAndLenderId(loanIdNum, parseInt(lenderId, 10));
        if (existingOffer) {
            errors.push('You already have an active offer on this loan. Cancel it first or use a different loan.');
            return { isValid: false, errors, warnings, remainingCapacity: 0, estimatedROI: 0 };
        }

        const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loanIdNum);
        const totalAmount = Number(loan.totalAmount);
        const remainingAmount = Math.max(0, totalAmount - totalOffered);

        if (remainingAmount < offerAmount) {
            errors.push(`Insufficient remaining loan amount. Available: ${remainingAmount.toFixed(2)} PLN`);
        }
        if (offerAmount > 1000000) {
            errors.push('Amount exceeds maximum allowed value');
        }

        const estimatedROI = totalAmount > 0 ? (offerAmount * 0.08) / 12 : 0;

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            remainingCapacity: Math.round(remainingAmount * 100) / 100,
            estimatedROI,
        };
    }

    async createOffer(lenderId: string, request: MakeOfferRequest): Promise<MakeOfferResponse> {
        const validation = await this.validateOffer(lenderId, request.loanId, request.amount);
        if (!validation.isValid) {
            throw new Error(`Offer validation failed: ${validation.errors.join(', ')}`);
        }

        const loanIdNum = parseInt(request.loanId, 10);
        const lenderIdNum = parseInt(lenderId, 10);
        const existingOffer = await this.loanOfferRepo.findByLoanIdAndLenderId(loanIdNum, lenderIdNum);
        if (existingOffer) {
            throw new Error('DUPLICATE_OFFER: You already have an active offer on this loan.');
        }

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const offer = new LoanOffer();
            offer.loanId = loanIdNum;
            offer.lenderId = lenderIdNum;
            offer.amount = request.amount;
            const saved = await this.loanOfferRepo.save(offer);

            const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loanIdNum);
            const loan = await this.loanRepo.findById(loanIdNum);
            if (!loan) throw new Error('Loan not found');
            const totalAmount = Number(loan.totalAmount);
            const fundedAmount = Math.min(totalOffered, totalAmount);
            const fundedPercent = totalAmount > 0 ? (fundedAmount / totalAmount) * 100 : 0;

            await this.loanRepo.update(loanIdNum, {
                fundedAmount,
            } as any);
            await this.loanAppRepo.update(loan.applicationId, {
                fundedAmount,
                fundedPercent,
            } as any);

            await this.auditLogRepository.create({
                actorId: lenderIdNum,
                action: 'OFFER_CREATED',
                entity: 'LOAN_OFFER',
                entityId: saved.id,
                createdAt: new Date(),
            } as any);

            // Auto-close at 100%: run close logic in same transaction
            const { MarketplaceCloseService } = await import('./MarketplaceCloseService');
            const closeService = new MarketplaceCloseService();
            const didClose = await closeService.tryAutoCloseAfterOffer(queryRunner, loanIdNum, fundedPercent);

            await queryRunner.commitTransaction();

            if (didClose) await closeService.notifyPartiesForClose(loanIdNum, 'auto');

            // Notify borrower about new funding progress (only if loan was not auto-closed,
            // since notifyPartiesForClose already sends LOAN_FUNDED in that case)
            if (!didClose) {
                await this.notificationService.notify(
                    loan.borrowerId,
                    'NEW_OFFER_RECEIVED',
                    'New Offer Received',
                    `Your loan has received a new offer of ${request.amount.toFixed(2)} PLN. Funding progress: ${Math.round(fundedPercent * 100) / 100}%.`,
                    { loanId: String(loanIdNum), offerId: String(saved.id), fundedPercent: String(Math.round(fundedPercent * 100) / 100) }
                );
            }

            return {
                offerId: String(saved.id),
                loanId: request.loanId,
                lenderId,
                amount: request.amount,
                loanFundedPercent: Math.round(fundedPercent * 100) / 100,
                createdAt: (saved.createdAt as Date).toISOString(),
                message: didClose ? 'Offer created and loan fully funded.' : 'Offer created successfully.',
            };
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * List all offers placed by this lender (for "My Bids" / My Offers).
     */
    async listMyOffers(lenderId: string): Promise<Array<{
        offerId: string;
        loanId: string;
        amount: number;
        confirmedAmount: number | null;
        loanAmount: number;
        loanStatus: string;
        fundedPercent: number;
        createdAt: string;
        delegatedStatus?: string | null;
        delegatedCommissionAmount?: number | null;
        delegatedApprovalExpiresAt?: string;
        delegatedPaymentDueAt?: string;
    }>> {
        await this.expireDelegatedOffers();
        const lenderIdNum = parseInt(lenderId, 10);
        const offers = await this.loanOfferRepo.findByLenderId(lenderIdNum);
        const result: Array<{
            offerId: string;
            loanId: string;
            amount: number;
            confirmedAmount: number | null;
            loanAmount: number;
            loanStatus: string;
            fundedPercent: number;
            createdAt: string;
            delegatedStatus?: string | null;
            delegatedCommissionAmount?: number | null;
            delegatedApprovalExpiresAt?: string;
            delegatedPaymentDueAt?: string;
        }> = [];
        for (const o of offers) {
            const loan = await this.loanRepo.findById(o.loanId);
            if (!loan) continue;
            const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loan.id);
            const totalAmount = Number(loan.totalAmount);
            const fundedPercent = totalAmount > 0 ? Math.min(100, (totalOffered / totalAmount) * 100) : 0;
            const statusCode = loan.statusId === 1 ? 'OPEN' : loan.statusId === 2 ? 'FUNDED' : 'OTHER';
            result.push({
                offerId: String(o.id),
                loanId: String(o.loanId),
                amount: Number(o.amount),
                confirmedAmount: o.confirmedAmount != null ? Number(o.confirmedAmount) : null,
                loanAmount: totalAmount,
                loanStatus: statusCode,
                fundedPercent: Math.round(fundedPercent * 100) / 100,
                createdAt: (o.createdAt as Date).toISOString(),
                delegatedStatus: o.delegatedStatus ?? null,
                delegatedCommissionAmount: o.delegatedCommissionAmount != null ? Number(o.delegatedCommissionAmount) : null,
                delegatedApprovalExpiresAt: o.delegatedApprovalExpiresAt ? new Date(o.delegatedApprovalExpiresAt).toISOString() : undefined,
                delegatedPaymentDueAt: o.delegatedPaymentDueAt ? new Date(o.delegatedPaymentDueAt).toISOString() : undefined,
            });
        }
        return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    /**
     * Cancel offer only if loan is still OPEN (statusId 1) and not yet funded.
     */
    async cancelOffer(lenderId: string, offerId: string): Promise<void> {
        const offerIdNum = parseInt(offerId, 10);
        const offer = await this.loanOfferRepo.findById(offerIdNum);
        if (!offer) throw new Error('Offer not found');
        if (offer.lenderId !== parseInt(lenderId, 10)) throw new Error('Offer not found');

        const loan = await this.loanRepo.findById(offer.loanId);
        if (!loan) throw new Error('Loan not found');
        if (loan.statusId !== 1) throw new Error('Cannot cancel offer: loan is no longer open');

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            await this.loanOfferRepo.delete(offerIdNum);
            const totalOffered = await this.loanOfferRepo.sumAmountByLoanId(loan.id);
            const totalAmount = Number(loan.totalAmount);
            const fundedAmount = Math.min(totalOffered, totalAmount);
            const fundedPercent = totalAmount > 0 ? (fundedAmount / totalAmount) * 100 : 0;
            await this.loanRepo.update(loan.id, { fundedAmount } as any);
            await this.loanAppRepo.update(loan.applicationId, { fundedAmount, fundedPercent } as any);
            await this.auditLogRepository.create({
                actorId: offer.lenderId,
                action: 'OFFER_CANCELLED',
                entity: 'LOAN_OFFER',
                entityId: offerIdNum,
                createdAt: new Date(),
            } as any);
            await queryRunner.commitTransaction();
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }
}

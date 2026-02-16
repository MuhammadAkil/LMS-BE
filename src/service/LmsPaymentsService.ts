import { randomUUID } from 'crypto';
import { PaymentRepository } from '../repository/PaymentRepository';
import { UserRepository } from '../repository/UserRepository';
import { Payment } from '../domain/Payment';
import { Przelewy24Service, P24WebhookPayload } from './Przelewy24Service';
import config from '../config/Config';
import {
    CreatePaymentRequest,
    CreatePaymentResponse,
    PaymentStatusResponse,
} from '../dto/PaymentDtos';

/** Lookup IDs - must match DB (payment_statuses, payment_providers, payment_types) */
const STATUS_PENDING = 1;
const STATUS_PAID = 2;
const PROVIDER_P24 = 1;
const PAYMENT_TYPE_COURSE = 2;

/** Default course price in grosz (100 PLN) if not provided */
const DEFAULT_COURSE_AMOUNT_GROSZ = 10000;

export class LmsPaymentsService {
    private paymentRepo: PaymentRepository;
    private userRepo: UserRepository;
    private p24: Przelewy24Service;

    constructor() {
        this.paymentRepo = new PaymentRepository();
        this.userRepo = new UserRepository();
        this.p24 = new Przelewy24Service();
    }

    /**
     * Create payment record and register with P24. Returns redirect URL for user.
     */
    async createPayment(userId: number, body: CreatePaymentRequest): Promise<CreatePaymentResponse> {
        const amountGrosz = body.amount ?? DEFAULT_COURSE_AMOUNT_GROSZ;
        const sessionId = randomUUID();
        const appBaseUrl = (config as any).app?.baseUrl ?? 'http://localhost:3009';

        const user = await this.userRepo.findById(userId);
        if (!user || !user.email) {
            throw new Error('User not found or missing email');
        }

        const payment = new Payment();
        payment.userId = userId;
        payment.courseId = body.courseId;
        payment.paymentTypeId = PAYMENT_TYPE_COURSE;
        payment.providerId = PROVIDER_P24;
        payment.statusId = STATUS_PENDING;
        payment.amount = amountGrosz / 100; // store in PLN in DB (decimal)
        payment.sessionId = sessionId;

        const saved = await this.paymentRepo.save(payment);

        const urlReturn = `${appBaseUrl}/payment/success?sessionId=${sessionId}`;
        const urlStatus = `${appBaseUrl.replace(/\/$/, '')}/webhook/p24`;

        const registered = await this.p24.registerTransaction({
            sessionId,
            amount: amountGrosz,
            currency: 'PLN',
            description: 'LMS Course Payment',
            email: user.email,
            country: 'PL',
            urlReturn,
            urlStatus,
        });

        const redirectUrl = this.p24.getRedirectUrl(registered.token);

        return {
            paymentId: saved.id as number,
            sessionId,
            redirectUrl,
            amount: amountGrosz,
            currency: 'PLN',
        };
    }

    /**
     * Handle P24 webhook: verify sign, call P24 verify, update payment, grant access.
     */
    async handleWebhook(payload: P24WebhookPayload): Promise<void> {
        const { sessionId, orderId, amount, sign } = payload;

        const payment = await this.paymentRepo.findBySessionId(sessionId);
        if (!payment) {
            throw new Error(`Payment not found for sessionId: ${sessionId}`);
        }

        const amountGrosz = Number(amount);
        const expectedAmount = Math.round(Number(payment.amount) * 100);
        if (amountGrosz !== expectedAmount) {
            throw new Error(`Amount mismatch: expected ${expectedAmount}, got ${amountGrosz}`);
        }

        const isValid = this.p24.verifyWebhookSign(sessionId, orderId, amountGrosz, sign);
        if (!isValid) {
            throw new Error('Invalid webhook signature');
        }

        await this.p24.verifyTransaction({
            sessionId,
            amount: amountGrosz,
            currency: 'PLN',
            orderId,
        });

        await this.paymentRepo.update(payment.id as number, {
            statusId: STATUS_PAID,
            paidAt: new Date(),
            providerOrderId: String(orderId),
        });

        // Optional: grant course access, send email, invoice, audit - extend here
    }

    /**
     * Get payment status for user (by payment id or session id).
     */
    async getPaymentStatus(userId: number, paymentId: number): Promise<PaymentStatusResponse | null> {
        const payment = await this.paymentRepo.findById(paymentId);
        if (!payment || payment.userId !== userId) {
            return null;
        }
        const statusCode = payment.statusId === STATUS_PAID ? 'PAID' : payment.statusId === STATUS_PENDING ? 'PENDING' : 'UNKNOWN';
        return {
            paymentId: payment.id as number,
            courseId: payment.courseId ?? undefined,
            status: statusCode,
            amount: Number(payment.amount),
            paidAt: payment.paidAt?.toISOString(),
            createdAt: payment.createdAt.toISOString(),
        };
    }

    /**
     * Get status by sessionId (e.g. after redirect from P24).
     */
    async getPaymentStatusBySessionId(sessionId: string): Promise<PaymentStatusResponse | null> {
        const payment = await this.paymentRepo.findBySessionId(sessionId);
        if (!payment) return null;
        const statusCode = payment.statusId === STATUS_PAID ? 'PAID' : payment.statusId === STATUS_PENDING ? 'PENDING' : 'UNKNOWN';
        return {
            paymentId: payment.id as number,
            courseId: payment.courseId ?? undefined,
            status: statusCode,
            amount: Number(payment.amount),
            paidAt: payment.paidAt?.toISOString(),
            createdAt: payment.createdAt.toISOString(),
        };
    }
}

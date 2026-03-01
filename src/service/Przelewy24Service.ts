import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import config from '../config/Config';

/**
 * Przelewy24 (P24) API integration.
 * - Register transaction → get token → redirect user to trnRequest/{token}
 * - Webhook: verify sign (SHA384), then call transaction/verify
 * Amounts in grosz (100 PLN = 10000).
 */
export interface P24RegisterRequest {
    merchantId: number;
    posId: number;
    sessionId: string;
    amount: number; // grosz
    currency: string;
    description: string;
    email: string;
    country: string;
    urlReturn: string;
    urlStatus: string;
    language?: string;
}

export interface P24RegisterResponse {
    token: string;
    data?: unknown;
}

export interface P24VerifyRequest {
    merchantId: number;
    posId: number;
    sessionId: string;
    amount: number;
    currency: string;
    orderId: number;
}

export interface P24WebhookPayload {
    merchantId: number;
    posId: number;
    sessionId: string;
    amount: number;
    currency: string;
    orderId: number;
    sign: string;
    statement?: string;
}

export class Przelewy24Service {
    private client: AxiosInstance;
    private merchantId: number;
    private posId: number;
    private apiKey: string;
    private crc: string;
    private orderKey: string;
    private apiUrl: string;

    constructor() {
        const cfg = config.p24 as any;
        this.merchantId = cfg?.merchantId ?? 0;
        this.posId = cfg?.posId ?? 0;
        this.apiKey = cfg?.apiKey ?? '';
        this.crc = cfg?.crc ?? '';
        this.orderKey = cfg?.orderKey ?? '';
        this.apiUrl = (cfg?.apiUrl ?? 'https://sandbox.przelewy24.pl').replace(/\/$/, '');

        this.client = axios.create({
            baseURL: this.apiUrl,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Basic ' + Buffer.from(`${this.merchantId}:${this.apiKey}`).toString('base64'),
            },
        });
    }

    /**
     * Register transaction with P24. Returns token for redirect URL.
     */
    async registerTransaction(params: {
        sessionId: string;
        amount: number;
        currency?: string;
        description: string;
        email: string;
        country?: string;
        urlReturn: string;
        urlStatus: string;
    }): Promise<P24RegisterResponse> {
        const body: P24RegisterRequest = {
            merchantId: this.merchantId,
            posId: this.posId,
            sessionId: params.sessionId,
            amount: params.amount,
            currency: params.currency ?? 'PLN',
            description: params.description,
            email: params.email,
            country: params.country ?? 'PL',
            urlReturn: params.urlReturn,
            urlStatus: params.urlStatus,
        };
        const { data } = await this.client.post<P24RegisterResponse>('/api/v1/transaction/register', body);
        return data;
    }

    /**
     * Build redirect URL for user to complete payment.
     */
    getRedirectUrl(token: string): string {
        return `${this.apiUrl}/trnRequest/${token}`;
    }

    /**
     * Verify webhook signature: SHA384(sessionId + orderId + amount + crcKey)
     */
    verifyWebhookSign(sessionId: string, orderId: number, amount: number, sign: string): boolean {
        const payload = `${sessionId}|${orderId}|${amount}|${this.crc}`;
        const expected = crypto.createHash('sha384').update(payload).digest('hex');
        const a = Buffer.from(expected, 'utf8');
        const b = Buffer.from(sign, 'utf8');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    /**
     * Call P24 verify endpoint after webhook (confirms with Order Key).
     */
    async verifyTransaction(params: {
        sessionId: string;
        amount: number;
        currency?: string;
        orderId: number;
    }): Promise<void> {
        const body: P24VerifyRequest = {
            merchantId: this.merchantId,
            posId: this.posId,
            sessionId: params.sessionId,
            amount: params.amount,
            currency: params.currency ?? 'PLN',
            orderId: params.orderId,
        };
        const verifyAuth = 'Basic ' + Buffer.from(`${this.merchantId}:${this.orderKey}`).toString('base64');
        await axios.post(`${this.apiUrl}/api/v1/transaction/verify`, body, {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                Authorization: verifyAuth,
            },
        });
    }

    getApiUrl(): string {
        return this.apiUrl;
    }
}

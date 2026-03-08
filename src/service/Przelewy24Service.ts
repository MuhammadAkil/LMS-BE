import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import config from '../config/Config';

/**
 * Przelewy24 (P24) REST API v1 integration.
 * - Register transaction → get token → redirect user to trnRequest/{token}
 * - Webhook: verify sign (SHA384 of JSON), then call PUT transaction/verify
 * Amounts in grosz (100 PLN = 10000).
 *
 * Sign format for all endpoints:
 *   register: SHA384({"sessionId":"...","merchantId":...,"amount":...,"currency":"...","crcKey":"..."})
 *   webhook/verify: SHA384({"sessionId":"...","orderId":...,"amount":...,"currency":"...","crcKey":"..."})
 * Key order must match exactly as documented by P24.
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
    sign: string; // required by P24 REST API
}

export interface P24RegisterResponse {
    token: string;
}

export interface P24VerifyRequest {
    merchantId: number;
    posId: number;
    sessionId: string;
    amount: number;
    currency: string;
    orderId: number;
    sign: string; // required by P24 REST API
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
     * Compute SHA384 signature over a JSON payload.
     * Key insertion order must match the P24 specification exactly.
     */
    private computeSign(fields: Record<string, unknown>): string {
        const json = JSON.stringify(fields);
        return crypto.createHash('sha384').update(json).digest('hex');
    }

    /**
     * Register transaction with P24. Returns token for redirect URL.
     * Sign: SHA384({"sessionId":"...","merchantId":...,"amount":...,"currency":"...","crcKey":"..."})
     * Response body: { "data": { "token": "..." }, "responseCode": 0 }
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
        const currency = params.currency ?? 'PLN';
        const sign = this.computeSign({
            sessionId: params.sessionId,
            merchantId: this.merchantId,
            amount: params.amount,
            currency,
            crcKey: this.crc,
        });

        const body: P24RegisterRequest = {
            merchantId: this.merchantId,
            posId: this.posId,
            sessionId: params.sessionId,
            amount: params.amount,
            currency,
            description: params.description,
            email: params.email,
            country: params.country ?? 'PL',
            urlReturn: params.urlReturn,
            urlStatus: params.urlStatus,
            sign,
        };

        const { data: responseBody } = await this.client.post('/api/v1/transaction/register', body);
        // P24 REST API wraps the token: { "data": { "token": "..." }, "responseCode": 0 }
        const tokenData = (responseBody as any)?.data;
        if (!tokenData?.token) {
            throw new Error(`P24 register failed: ${JSON.stringify(responseBody)}`);
        }
        return { token: tokenData.token };
    }

    /**
     * Build redirect URL for user to complete payment.
     */
    getRedirectUrl(token: string): string {
        return `${this.apiUrl}/trnRequest/${token}`;
    }

    /**
     * Verify P24 webhook notification signature.
     * P24 computes: SHA384({"sessionId":"...","orderId":...,"amount":...,"currency":"...","crcKey":"..."})
     * Both sides produce a 96-char hex string; compared using timing-safe equality.
     */
    verifyWebhookSign(sessionId: string, orderId: number, amount: number, currency: string, sign: string): boolean {
        // Reject obviously malformed sign values to avoid Buffer.from('hex') silent truncation
        if (!/^[0-9a-f]{96}$/i.test(sign)) return false;
        const expected = this.computeSign({
            sessionId,
            orderId,
            amount,
            currency,
            crcKey: this.crc,
        });
        // Compare decoded binary (48 bytes) for constant-time safety
        const a = Buffer.from(expected, 'hex');
        const b = Buffer.from(sign, 'hex');
        return crypto.timingSafeEqual(a, b);
    }

    /**
     * Confirm transaction with P24 after webhook receipt (uses Order Key for auth).
     * Endpoint: PUT /api/v1/transaction/verify
     * Sign: SHA384({"sessionId":"...","orderId":...,"amount":...,"currency":"...","crcKey":"..."})
     */
    async verifyTransaction(params: {
        sessionId: string;
        amount: number;
        currency?: string;
        orderId: number;
    }): Promise<void> {
        const currency = params.currency ?? 'PLN';
        const sign = this.computeSign({
            sessionId: params.sessionId,
            orderId: params.orderId,
            amount: params.amount,
            currency,
            crcKey: this.crc,
        });

        const body: P24VerifyRequest = {
            merchantId: this.merchantId,
            posId: this.posId,
            sessionId: params.sessionId,
            amount: params.amount,
            currency,
            orderId: params.orderId,
            sign,
        };
        const verifyAuth = 'Basic ' + Buffer.from(`${this.merchantId}:${this.orderKey}`).toString('base64');
        await axios.put(`${this.apiUrl}/api/v1/transaction/verify`, body, {
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

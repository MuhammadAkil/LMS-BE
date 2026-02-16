/**
 * DTOs for LMS course payments (Przelewy24).
 */
export interface CreatePaymentRequest {
    courseId: number;
    /** Optional: amount in grosz (e.g. 10000 = 100 PLN). If omitted, backend may use course price or default. */
    amount?: number;
}

export interface CreatePaymentResponse {
    paymentId: number;
    sessionId: string;
    redirectUrl: string;
    amount: number;
    currency: string;
}

export interface PaymentStatusResponse {
    paymentId: number;
    courseId?: number;
    status: string;
    amount: number;
    paidAt?: string;
    createdAt: string;
}

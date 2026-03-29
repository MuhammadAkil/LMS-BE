/**
 * Company Test Helpers
 * Shared fixtures, builders, and mock factories for all company-related tests.
 */

// ─────────────────────────────────────────────────────────────────
// 1. Fixture builders
// ─────────────────────────────────────────────────────────────────

export function buildCompanyRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
    return {
        id: 1,
        name: 'TestCo Sp. z o.o.',
        bankAccount: 'PL61109010140000071219812875',
        status_id: 2, // APPROVED
        conditions_status: 'approved',
        conditions_locked_at: new Date('2025-01-01T00:00:00Z'),
        conditions_json: JSON.stringify({
            minManagedAmount: 10000,
            minPeriodMonths: 12,
            managementCommissionRate: 2.5,
            bankAccount: 'PL61109010140000071219812875',
            handleReminders: true,
            handleCourtClaims: true,
            autoOfferSettings: {},
        }),
        commission_pct: 2.5,
        min_managed_amount: 10000,
        admin_revision_note: null,
        ...overrides,
    };
}

export function buildLenderRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
    return {
        id: 10,
        email: 'lender@example.com',
        first_name: 'Jan',
        last_name: 'Kowalski',
        name: 'Jan Kowalski',
        status_id: 2, // ACTIVE
        role_id: 3,
        ...overrides,
    };
}

export function buildCompanyLenderRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
    return {
        id: 100,
        companyId: 1,
        lenderId: 10,
        lenderEmail: 'lender@example.com',
        lenderName: 'Jan Kowalski',
        amountLimit: 50000,
        active: 1,
        agreementSignedAt: new Date('2025-02-01T00:00:00Z'),
        agreementTerminatedAt: null,
        createdAt: new Date('2025-02-01T00:00:00Z'),
        updatedAt: new Date('2025-02-01T00:00:00Z'),
        ...overrides,
    };
}

export function buildAgreementRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
    return {
        id: 200,
        companyId: 1,
        amount: 50000,
        signedAt: null,
        createdAt: new Date('2025-01-15T00:00:00Z'),
        updatedAt: new Date('2025-01-15T00:00:00Z'),
        ...overrides,
    };
}

export function buildLoanRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
    return {
        id: 1000,
        borrowerId: 50,
        lenderId: 10,
        totalAmount: 5000,
        fundedAmount: 5000,
        interest_rate: 8.5,
        statusId: 2,
        status: 'ACTIVE',
        createdAt: new Date('2025-03-01T00:00:00Z'),
        dueDate: new Date('2026-03-01T00:00:00Z'),
        borrowerEmail: 'borrower@example.com',
        borrowerName: 'Anna Nowak',
        ...overrides,
    };
}

export function buildRepaymentRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
    return {
        id: 500,
        loanId: 1000,
        dueDate: new Date('2025-04-01T00:00:00Z'),
        amount: 450.00,
        paidDate: null,
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────
// 2. QueryRunner mock factory
// ─────────────────────────────────────────────────────────────────

/**
 * Creates a Jest mock for TypeORM QueryRunner.
 * Each call to `mockQr.query` returns results from the `responses` array in order.
 */
export function buildMockQueryRunner(responses: any[] = []) {
    let callIndex = 0;
    const query = jest.fn().mockImplementation(() => {
        const result = responses[callIndex] ?? [];
        callIndex++;
        return Promise.resolve(result);
    });
    const release = jest.fn().mockResolvedValue(undefined);
    return { query, release };
}

/**
 * Resets a mock query runner's call index and re-configures responses.
 */
export function resetMockQueryRunner(
    qr: { query: jest.Mock; release: jest.Mock },
    responses: any[]
) {
    let callIndex = 0;
    qr.query.mockImplementation(() => {
        const result = responses[callIndex] ?? [];
        callIndex++;
        return Promise.resolve(result);
    });
    qr.release.mockResolvedValue(undefined);
}

// ─────────────────────────────────────────────────────────────────
// 3. AppDataSource mock
// ─────────────────────────────────────────────────────────────────

/**
 * Creates the standard AppDataSource mock with a configurable query runner.
 * Use this in jest.mock() factories.
 */
export function buildMockAppDataSource(qr: ReturnType<typeof buildMockQueryRunner>) {
    return {
        AppDataSource: {
            createQueryRunner: jest.fn().mockReturnValue(qr),
            getRepository: jest.fn(),
            query: jest.fn(),
            initialize: jest.fn().mockResolvedValue(undefined),
        },
    };
}

// ─────────────────────────────────────────────────────────────────
// 4. CompanyAuditService mock
// ─────────────────────────────────────────────────────────────────

export function buildMockAuditService() {
    return {
        logAction: jest.fn().mockResolvedValue({ id: 1 }),
        notifyUser: jest.fn().mockResolvedValue({ id: 1 }),
        notifyMultiple: jest.fn().mockResolvedValue([]),
        logAndNotify: jest.fn().mockResolvedValue({ audit: { id: 1 }, notification: { id: 1 } }),
        logValidationFailure: jest.fn().mockResolvedValue({ id: 1 }),
    };
}

// ─────────────────────────────────────────────────────────────────
// 5. Express Request mock
// ─────────────────────────────────────────────────────────────────

export function buildMockRequest(userOverrides: Partial<Record<string, any>> = {}) {
    return {
        user: {
            id: 1,
            roleId: 4,
            companyId: 1,
            email: 'company@example.com',
            ...userOverrides,
        },
        body: {},
        params: {},
        query: {},
        headers: {},
    } as any;
}

export function buildMockResponse() {
    const json = jest.fn().mockReturnThis();
    const status = jest.fn().mockReturnThis();
    const send = jest.fn().mockReturnThis();
    return { json, status, send } as any;
}

// ─────────────────────────────────────────────────────────────────
// 6. Valid / invalid IBAN fixtures
// ─────────────────────────────────────────────────────────────────

export const VALID_IBAN = 'PL61109010140000071219812875'; // 28 chars, PL + 26 digits
export const INVALID_IBAN = 'DE89370400440532013000';       // German IBAN — invalid for PL
export const SHORT_IBAN = 'PL1234';                       // too short

// ─────────────────────────────────────────────────────────────────
// 7. Submission fixture helpers
// ─────────────────────────────────────────────────────────────────

export function buildSubmitConditionsRequest(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
    return {
        minManagedAmount: 10000,
        minPeriodMonths: 12,
        managementCommissionRate: 2.5,
        bankAccount: VALID_IBAN,
        handleReminders: true,
        handleCourtClaims: false,
        ...overrides,
    };
}

export function buildLinkLenderRequest(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
    return {
        lenderId: 10,
        amountLimit: 50000,
        active: true,
        ...overrides,
    };
}

export function buildBulkRemindersRequest(loanIds: number[] = [1001, 1002, 1003]): Record<string, any> {
    return {
        loanIds,
        message: 'Please pay your overdue instalment.',
        reminderType: 'EMAIL',
    };
}

export function buildBulkClaimsRequest(loanIds: number[] = [2001, 2002]): Record<string, any> {
    return {
        loanIds,
        reason: 'Unpaid debt — 90+ days overdue',
        claimType: 'COURT',
    };
}

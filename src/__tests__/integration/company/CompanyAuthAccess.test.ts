/**
 * Integration tests — Company Auth & Access Control  (Flow 1 + Flow 17)
 *
 * Tests the middleware guard chain by exercising the guard functions directly
 * with mock Express req/res/next objects — simulates the HTTP layer without
 * the overhead of spinning up the full HTTP server.
 *
 * Covers:
 *  ✓ CompanyGuard — allows roleId=4 (COMPANY)
 *  ✓ CompanyGuard — blocks non-company roles (borrower, lender, admin)
 *  ✓ CompanyGuard — blocks unauthenticated requests (no user on req)
 *  ✓ CompanyStatusGuard — allows APPROVED company (statusId=2)
 *  ✓ CompanyStatusGuard — blocks PENDING company (not yet approved)
 *  ✓ CompanyStatusGuard — blocks SUSPENDED company (statusId=4, 403/423)
 *  ✓ CompanyStatusGuard — blocks company not found
 *  ✓ ConditionsApprovedGuard — allows when conditions_status='approved'
 *  ✓ ConditionsApprovedGuard — blocks when conditions are pending or not submitted
 *  ✓ AgreementSignatureGuard — allows when signed agreement exists
 *  ✓ AgreementSignatureGuard — blocks when no signed agreement (Operational Lock 423)
 *  ✓ ExportLimitGuard — allows loanIds.length ≤ 500
 *  ✓ ExportLimitGuard — blocks loanIds.length > 500 with correct error
 *  ✓ ExportLimitGuard — blocks non-array loanIds
 */

// ── Mock: database ────────────────────────────────────────────────
let mockQrQuery: jest.Mock;
let mockQrRelease: jest.Mock;

jest.mock('../../../config/database', () => {
    mockQrQuery = jest.fn();
    mockQrRelease = jest.fn().mockResolvedValue(undefined);
    return {
        AppDataSource: {
            createQueryRunner: jest.fn(() => ({ query: mockQrQuery, release: mockQrRelease })),
            getRepository: jest.fn(),
        },
    };
});

import {
    CompanyGuard,
    CompanyStatusGuard,
    ConditionsApprovedGuard,
    AgreementSignatureGuard,
    ExportLimitGuard,
} from '../../../middleware/CompanyGuards';
import { buildMockRequest, buildMockResponse } from '../../helpers/companyTestHelpers';

// ─────────────────────────────────────────────────────────────────

describe('Company Role Guards (Integration)', () => {

    // ──────────────────────────────────────────────────────────────
    // CompanyGuard
    // ──────────────────────────────────────────────────────────────

    describe('CompanyGuard', () => {
        it('calls next() for a valid company user (roleId=4)', () => {
            const req = buildMockRequest({ roleId: 4 });
            const res = buildMockResponse();
            const next = jest.fn();

            CompanyGuard(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        });

        it('returns 403 for a borrower user (roleId=2)', () => {
            const req = buildMockRequest({ roleId: 2 });
            const res = buildMockResponse();
            const next = jest.fn();

            CompanyGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ statusCode: '403' })
            );
        });

        it('returns 403 for a lender user (roleId=3)', () => {
            const req = buildMockRequest({ roleId: 3 });
            const res = buildMockResponse();
            const next = jest.fn();

            CompanyGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('returns 403 for an admin user (roleId=1)', () => {
            const req = buildMockRequest({ roleId: 1 });
            const res = buildMockResponse();
            const next = jest.fn();

            CompanyGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('returns 401 for unauthenticated request (no user)', () => {
            const req = { user: null, body: {}, params: {}, query: {} } as any;
            const res = buildMockResponse();
            const next = jest.fn();

            CompanyGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    // ──────────────────────────────────────────────────────────────
    // CompanyStatusGuard
    // ──────────────────────────────────────────────────────────────

    describe('CompanyStatusGuard', () => {
        it('allows APPROVED company (statusId=2)', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            const res = buildMockResponse();
            const next = jest.fn();

            mockQrQuery.mockResolvedValueOnce([
                { id: 1, status_id: 2, conditionsStatus: 'approved', statusCode: 'APPROVED' }
            ]);

            await CompanyStatusGuard(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });

        it('blocks company with statusId=1 (PENDING — not yet approved)', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            const res = buildMockResponse();
            const next = jest.fn();

            mockQrQuery.mockResolvedValueOnce([
                { id: 1, status_id: 1, conditionsStatus: 'not_submitted', statusCode: 'PENDING' }
            ]);

            await CompanyStatusGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(423);
            const body = res.json.mock.calls[0][0];
            expect(body.errorCode).toBe('COMPANY_PENDING');
        });

        it('blocks SUSPENDED company (statusId=4)', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            const res = buildMockResponse();
            const next = jest.fn();

            mockQrQuery.mockResolvedValueOnce([
                { id: 1, status_id: 3, conditionsStatus: 'approved', statusCode: 'SUSPENDED' }
            ]);

            await CompanyStatusGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(423);
            const body = res.json.mock.calls[0][0];
            expect(body.errorCode).toBe('COMPANY_SUSPENDED');
        });

        it('returns 404 when company record not found', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 9999 });
            const res = buildMockResponse();
            const next = jest.fn();

            mockQrQuery.mockResolvedValueOnce([]); // no rows

            await CompanyStatusGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('returns 401 when companyId is missing from token', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: undefined });
            const res = buildMockResponse();
            const next = jest.fn();

            await CompanyStatusGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    // ──────────────────────────────────────────────────────────────
    // ConditionsApprovedGuard
    // ──────────────────────────────────────────────────────────────

    describe('ConditionsApprovedGuard', () => {
        it('calls next() when conditions_status=approved', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            (req as any).company = { id: 1, status_id: 2, conditionsStatus: 'approved' };
            const res = buildMockResponse();
            const next = jest.fn();

            await ConditionsApprovedGuard(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });

        it('blocks when conditions_status=pending_approval', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            (req as any).company = { id: 1, status_id: 2, conditionsStatus: 'pending_approval' };
            const res = buildMockResponse();
            const next = jest.fn();

            await ConditionsApprovedGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            const body = res.json.mock.calls[0][0];
            expect(body.errorCode).toBe('CONDITIONS_NOT_APPROVED');
        });

        it('blocks when conditions_status=not_submitted', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            (req as any).company = { id: 1, status_id: 2, conditionsStatus: 'not_submitted' };
            const res = buildMockResponse();
            const next = jest.fn();

            await ConditionsApprovedGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('returns 401 when req.company is not loaded (guard chain misconfigured)', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            // No (req as any).company set
            const res = buildMockResponse();
            const next = jest.fn();

            await ConditionsApprovedGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    // ──────────────────────────────────────────────────────────────
    // AgreementSignatureGuard  (Operational Lock)
    // ──────────────────────────────────────────────────────────────

    describe('AgreementSignatureGuard', () => {
        it('calls next() when a signed agreement exists', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            const res = buildMockResponse();
            const next = jest.fn();

            mockQrQuery.mockResolvedValueOnce([
                { id: 200, signedAt: new Date(), amount: 50000 }
            ]);

            await AgreementSignatureGuard(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect((req as any).agreement).toBeDefined();
            expect((req as any).agreement.id).toBe(200);
        });

        it('returns 423 Operational Lock when no signed agreement', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: 1 });
            const res = buildMockResponse();
            const next = jest.fn();

            mockQrQuery.mockResolvedValueOnce([]); // no signed agreements

            await AgreementSignatureGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(423);
            const body = res.json.mock.calls[0][0];
            expect(body.statusMessage).toBe('Operational Lock');
        });

        it('returns 401 when companyId missing from token', async () => {
            const req = buildMockRequest({ roleId: 4, companyId: undefined });
            const res = buildMockResponse();
            const next = jest.fn();

            await AgreementSignatureGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    // ──────────────────────────────────────────────────────────────
    // ExportLimitGuard  (Flow 10 / 9: bulk action size cap)
    // ──────────────────────────────────────────────────────────────

    describe('ExportLimitGuard', () => {
        it('allows loanIds.length = 500 (boundary — pass)', () => {
            const req = { body: { loanIds: Array.from({ length: 500 }, (_, i) => i + 1) } } as any;
            const res = buildMockResponse();
            const next = jest.fn();

            ExportLimitGuard(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });

        it('blocks loanIds.length = 501 (over limit)', () => {
            const req = { body: { loanIds: Array.from({ length: 501 }, (_, i) => i + 1) } } as any;
            const res = buildMockResponse();
            const next = jest.fn();

            ExportLimitGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            expect(body.statusMessage).toBe('Export Limit Exceeded');
            expect(body.errors?.loanIds[0]).toContain('501');
        });

        it('blocks when loanIds is not an array (bad request)', () => {
            const req = { body: { loanIds: 'not-an-array' } } as any;
            const res = buildMockResponse();
            const next = jest.fn();

            ExportLimitGuard(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('allows empty array (validation handled downstream)', () => {
            const req = { body: { loanIds: [] } } as any;
            const res = buildMockResponse();
            const next = jest.fn();

            ExportLimitGuard(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
        });
    });
});

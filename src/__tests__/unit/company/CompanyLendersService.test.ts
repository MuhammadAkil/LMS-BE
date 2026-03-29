/**
 * Unit tests — CompanyLendersService
 *
 * Covers Flow 3: Lender (Client) Account Management
 *  ✓ getLenders — returns mapped DTO array
 *  ✓ linkLender — happy path
 *  ✓ linkLender — lender does not exist / wrong role → error
 *  ✓ linkLender — lender not active → error
 *  ✓ linkLender — amount below company minimum → error
 *  ✓ linkLender — already linked to this company → error
 *  ✓ linkLender — already managed by another company (conflict) → error
 *  ✓ updateLender — happy path, updates amountLimit
 *  ✓ updateLender — relationship not found → error
 *  ✓ updateLender — no fields provided → error
 *  ✓ toggleLenderStatus — active/inactive toggle
 *  ✓ terminateLender — sets terminated_at on agreement, deactivates lender
 *  ✓ terminateLender — link not found → error
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

jest.mock('../../../service/CompanyAuditService', () => ({
    CompanyAuditService: jest.fn().mockImplementation(() => ({
        logAction: jest.fn().mockResolvedValue({ id: 1 }),
        notifyUser: jest.fn().mockResolvedValue({ id: 1 }),
        notifyMultiple: jest.fn().mockResolvedValue([]),
    })),
}));

import { CompanyLendersService } from '../../../service/CompanyLendersService';
import {
    buildCompanyLenderRow,
    buildLenderRow,
    buildLinkLenderRequest,
} from '../../helpers/companyTestHelpers';

// ─────────────────────────────────────────────────────────────────
const COMPANY_ID = 1;
const USER_ID = 99;

describe('CompanyLendersService', () => {
    let service: CompanyLendersService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CompanyLendersService();
    });

    // ── getLenders ────────────────────────────────────────────────

    describe('getLenders', () => {
        it('returns correctly mapped lender DTOs', async () => {
            const row = buildCompanyLenderRow();
            mockQrQuery.mockResolvedValueOnce([row]);

            const result = await service.getLenders(COMPANY_ID);

            expect(result).toHaveLength(1);
            expect(result[0].lenderId).toBe(row.lenderId);
            expect(result[0].amountLimit).toBe(50000);
            expect(result[0].active).toBe(true);
            expect(result[0].agreementStatus).toBe('active');
        });

        it('marks agreement as terminated when terminated_at is set', async () => {
            const row = buildCompanyLenderRow({ agreementTerminatedAt: new Date() });
            mockQrQuery.mockResolvedValueOnce([row]);

            const result = await service.getLenders(COMPANY_ID);
            expect(result[0].agreementStatus).toBe('terminated');
        });

        it('marks agreement as pending when not yet signed', async () => {
            const row = buildCompanyLenderRow({ agreementSignedAt: null });
            mockQrQuery.mockResolvedValueOnce([row]);

            const result = await service.getLenders(COMPANY_ID);
            expect(result[0].agreementStatus).toBe('pending');
        });

        it('returns empty array when no lenders linked', async () => {
            mockQrQuery.mockResolvedValueOnce([]);
            const result = await service.getLenders(COMPANY_ID);
            expect(result).toHaveLength(0);
        });
    });

    // ── linkLender ────────────────────────────────────────────────

    describe('linkLender — happy path', () => {
        it('creates company_lenders record and returns DTO', async () => {
            const lenderRow = buildLenderRow();
            const companyRow = [{ min_managed_amount: 1000 }];
            const newLenderRow = buildCompanyLenderRow({ id: 101 });

            mockQrQuery
                .mockResolvedValueOnce([lenderRow])    // SELECT users (lender exists)
                .mockResolvedValueOnce(companyRow)     // SELECT min_managed_amount
                .mockResolvedValueOnce([])             // existing link check (none)
                .mockResolvedValueOnce([])             // other company conflict check (none)
                .mockResolvedValueOnce({ insertId: 101 }) // INSERT
                .mockResolvedValueOnce([newLenderRow]); // getLenders re-fetch

            const request = buildLinkLenderRequest({ amountLimit: 50000 });
            const result = await service.linkLender(COMPANY_ID, USER_ID, request as any);

            expect(result.id).toBe(101);
            expect(result.amountLimit).toBe(50000);
        });
    });

    describe('linkLender — error cases', () => {
        it('throws when lender account does not exist', async () => {
            mockQrQuery.mockResolvedValueOnce([]); // user not found

            const request = buildLinkLenderRequest({ lenderId: 9999 });
            await expect(service.linkLender(COMPANY_ID, USER_ID, request as any))
                .rejects.toThrow('Lender not found or not a valid lender user');
        });

        it('throws when lender account is inactive', async () => {
            const inactiveLender = buildLenderRow({ status_id: 3 }); // INACTIVE
            mockQrQuery.mockResolvedValueOnce([inactiveLender]);

            const request = buildLinkLenderRequest();
            await expect(service.linkLender(COMPANY_ID, USER_ID, request as any))
                .rejects.toThrow('Lender account is not active');
        });

        it('throws when amountLimit is below company minimum', async () => {
            const lenderRow = buildLenderRow();
            const companyRow = [{ min_managed_amount: 100000 }]; // min = 100k

            mockQrQuery
                .mockResolvedValueOnce([lenderRow])
                .mockResolvedValueOnce(companyRow);

            const request = buildLinkLenderRequest({ amountLimit: 5000 }); // below min
            await expect(service.linkLender(COMPANY_ID, USER_ID, request as any))
                .rejects.toThrow('Managed amount must be at least 100000 PLN');
        });

        it('throws when lender is already linked to this company', async () => {
            const lenderRow = buildLenderRow();
            const companyRow = [{ min_managed_amount: 1000 }];

            mockQrQuery
                .mockResolvedValueOnce([lenderRow])
                .mockResolvedValueOnce(companyRow)
                .mockResolvedValueOnce([{ id: 99 }]); // already linked

            const request = buildLinkLenderRequest();
            await expect(service.linkLender(COMPANY_ID, USER_ID, request as any))
                .rejects.toThrow('Lender already linked to this company');
        });

        it('throws when lender already managed by another company (conflict)', async () => {
            const lenderRow = buildLenderRow();
            const companyRow = [{ min_managed_amount: 1000 }];

            mockQrQuery
                .mockResolvedValueOnce([lenderRow])
                .mockResolvedValueOnce(companyRow)
                .mockResolvedValueOnce([])              // not linked to this company
                .mockResolvedValueOnce([{ id: 77 }]);  // active agreement with ANOTHER company

            const request = buildLinkLenderRequest();
            await expect(service.linkLender(COMPANY_ID, USER_ID, request as any))
                .rejects.toThrow('Lender already has an active management agreement with another company');
        });
    });

    // ── updateLender ──────────────────────────────────────────────

    describe('updateLender', () => {
        it('updates amountLimit correctly', async () => {
            const existingRow = buildCompanyLenderRow();
            const updatedRow = buildCompanyLenderRow({ amountLimit: 75000 });

            mockQrQuery
                .mockResolvedValueOnce([existingRow])    // SELECT existing
                .mockResolvedValueOnce({ affectedRows: 1 }) // UPDATE
                .mockResolvedValueOnce([updatedRow]);    // getLenders re-fetch

            const result = await service.updateLender(COMPANY_ID, USER_ID, 100, { amountLimit: 75000 } as any);
            expect(result.amountLimit).toBe(75000);
        });

        it('throws when company lender relationship not found', async () => {
            mockQrQuery.mockResolvedValueOnce([]); // not found

            await expect(
                service.updateLender(COMPANY_ID, USER_ID, 9999, { amountLimit: 50000 } as any)
            ).rejects.toThrow('Company lender relationship not found');
        });

        it('throws when no updatable fields are provided', async () => {
            const existingRow = buildCompanyLenderRow();
            mockQrQuery.mockResolvedValueOnce([existingRow]);

            await expect(
                service.updateLender(COMPANY_ID, USER_ID, 100, {} as any)
            ).rejects.toThrow('No fields to update');
        });
    });

    // ── toggleLenderStatus ────────────────────────────────────────

    describe('toggleLenderStatus', () => {
        it('sets active to false (deactivate)', async () => {
            const existingRow = buildCompanyLenderRow();
            const deactivated = buildCompanyLenderRow({ active: 0 });

            mockQrQuery
                .mockResolvedValueOnce([existingRow])
                .mockResolvedValueOnce({ affectedRows: 1 })
                .mockResolvedValueOnce([deactivated]);

            const result = await service.toggleLenderStatus(COMPANY_ID, USER_ID, 100, false);
            expect(result.active).toBe(false);
        });

        it('throws when lender link not found', async () => {
            mockQrQuery.mockResolvedValueOnce([]);
            await expect(
                service.toggleLenderStatus(COMPANY_ID, USER_ID, 9999, true)
            ).rejects.toThrow('Company lender relationship not found');
        });
    });

    // ── terminateLender ───────────────────────────────────────────

    describe('terminateLender', () => {
        it('terminates agreement and deactivates lender link', async () => {
            const existingRow = [{ lenderId: 10 }];

            mockQrQuery
                .mockResolvedValueOnce(existingRow)        // SELECT lenderId
                .mockResolvedValueOnce({ affectedRows: 1 }) // UPDATE management_agreements
                .mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE company_lenders

            await expect(
                service.terminateLender(COMPANY_ID, USER_ID, 100)
            ).resolves.not.toThrow();

            // Verify agreement termination query was called
            const agreementUpdate = mockQrQuery.mock.calls.find(
                (c: any[]) => String(c[0]).includes('management_agreements') && String(c[0]).includes('terminated_at')
            );
            expect(agreementUpdate).toBeDefined();
        });

        it('throws when lender link not found', async () => {
            mockQrQuery.mockResolvedValueOnce([]);
            await expect(
                service.terminateLender(COMPANY_ID, USER_ID, 9999)
            ).rejects.toThrow('Company lender link not found');
        });
    });
});

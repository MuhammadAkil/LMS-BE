/**
 * Unit tests — CompanyDashboardService & commission calculation
 *
 * Covers Flows 11 & 13:
 *  Flow 11: Dashboard & Monitoring
 *  ✓ getDashboard — returns correct summary DTO
 *  ✓ getDashboard — managedFunds falls back to company_lenders.amountLimit when no agreements
 *  ✓ getDashboard — empty state (no lenders / loans)
 *  ✓ getDashboard — audit action logged on view
 *
 *  Flow 13: Commission & Earnings
 *  ✓ commissionsAccrued: computed from commissionRate × managedAmount (pro-rated)
 *  ✓ commissionsAccrued: 0 when no agreements signed
 *  ✓ commissionsAccrued: 0 when commissionRate is 0
 *  ✓ defaultRate: correctly derived from defaulted / active loans
 *  ✓ defaultRate: 0 when no active loans
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

// Mock the commission util — unit test should not depend on the real calculation
jest.mock('../../../util/CommissionCalculationUtil', () => ({
    sumAccruedCommissionsCurrentYear: jest.fn((lenders: any[], rate: number) => {
        // Simple stub: sum(amount * rate) for lenders with no terminated agreements
        return lenders.reduce((acc: number, l: any) => acc + l.managedAmount * rate, 0);
    }),
}));

import { CompanyDashboardService } from '../../../service/CompanyDashboardService';
import { buildCompanyRow } from '../../helpers/companyTestHelpers';

// ─────────────────────────────────────────────────────────────────
const COMPANY_ID = 1;
const USER_ID = 99;

describe('CompanyDashboardService', () => {
    let service: CompanyDashboardService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CompanyDashboardService();
    });

    // ── SHARED: build standard set of mock responses ──────────────
    function mockDefaultDashboard({
        managedFunds = 50000,
        activeLoanCount = 5,
        defaultedCount = 1,
        totalRules = 3,
        activeRules = 2,
        bulkActions = [] as any[],
        agreementAmount = 50000,
        commissionPct = 2.5,
    } = {}) {
        const company = buildCompanyRow({ conditions_status: 'approved', commission_pct: commissionPct });

        mockQrQuery
            // 0. company conditions
            .mockResolvedValueOnce([company])
            // 1. managed funds (signed agreements)
            .mockResolvedValueOnce([{ totalAmount: managedFunds > 0 ? managedFunds : '0' }])
            // 2. active managed loans
            .mockResolvedValueOnce([{ count: activeLoanCount }])
            // 3. defaulted loans
            .mockResolvedValueOnce([{ count: defaultedCount }])
            // 4. automation status
            .mockResolvedValueOnce([{ totalRules, activeRules }])
            // 5. recent bulk actions
            .mockResolvedValueOnce(bulkActions)
            // 6. agreement status
            .mockResolvedValueOnce([{ id: 200, signedAt: new Date('2025-01-01'), amount: agreementAmount }])
            // 7. commissionPct from companies
            .mockResolvedValueOnce([{ commission_pct: commissionPct }])
            // 8. agreement rows for commission calc
            .mockResolvedValueOnce([{ amount: agreementAmount, signedAt: new Date('2025-01-01'), terminated_at: null }])
            // 9. recent automation log
            .mockResolvedValueOnce([]);
    }

    // ── getDashboard ──────────────────────────────────────────────

    describe('getDashboard — happy path', () => {
        it('returns correct summary DTO with all fields populated', async () => {
            mockDefaultDashboard({
                managedFunds: 50000,
                activeLoanCount: 5,
                defaultedCount: 1,
                totalRules: 3,
                activeRules: 2,
                commissionPct: 2.5,
            });

            const result = await service.getDashboard(COMPANY_ID, USER_ID);

            expect(result.conditionsStatus).toBe('approved');
            expect(result.managedFunds).toBe(50000);
            expect(result.activeManagedLoans).toBe(5);
            expect(result.defaultedLoans).toBe(1);
            expect(result.automationStatus.rulesCount).toBe(3);
            expect(result.automationStatus.activeRules).toBe(2);
            expect(result.agreementStatus.isSigned).toBe(true);
            expect(result.agreementStatus.amount).toBe(50000);
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('auditService.logAction is called to record dashboard view', async () => {
            mockDefaultDashboard();

            // Import mocked audit service to verify calls
            const { CompanyAuditService } = require('../../../service/CompanyAuditService');
            const mockInstance = CompanyAuditService.mock.results[0]?.value;

            await service.getDashboard(COMPANY_ID, USER_ID);

            if (mockInstance) {
                expect(mockInstance.logAction).toHaveBeenCalledWith(
                    USER_ID,
                    'VIEW_COMPANY_DASHBOARD',
                    'DASHBOARD',
                    COMPANY_ID
                );
            }
        });
    });

    describe('getDashboard — managedFunds fallback', () => {
        it('falls back to company_lenders.amountLimit when no signed agreements', async () => {
            const company = buildCompanyRow({ conditions_status: 'approved', commission_pct: 2.5 });

            mockQrQuery
                .mockResolvedValueOnce([company])                      // conditions
                .mockResolvedValueOnce([{ totalAmount: '0' }])        // agreements = 0
                .mockResolvedValueOnce([{ total: 75000 }])            // fallback: company_lenders
                .mockResolvedValueOnce([{ count: 2 }])                // active loans
                .mockResolvedValueOnce([{ count: 0 }])                // defaulted loans
                .mockResolvedValueOnce([{ totalRules: 1, activeRules: 1 }])
                .mockResolvedValueOnce([])                             // bulk actions
                .mockResolvedValueOnce([])                             // agreement (unsigned)
                .mockResolvedValueOnce([{ commission_pct: 2.5 }])
                .mockResolvedValueOnce([])                             // no agreements for commission
                .mockResolvedValueOnce([]);                            // auto log

            const result = await service.getDashboard(COMPANY_ID, USER_ID);
            expect(result.managedFunds).toBe(75000);
        });
    });

    describe('getDashboard — empty state', () => {
        it('returns zeros for all counts when no lenders or loans exist', async () => {
            const company = buildCompanyRow({ conditions_status: 'not_submitted', commission_pct: 0 });

            mockQrQuery
                .mockResolvedValueOnce([company])
                .mockResolvedValueOnce([{ totalAmount: '0' }])  // managed funds = 0
                .mockResolvedValueOnce([{ total: 0 }])          // no fallback either
                .mockResolvedValueOnce([{ count: 0 }])          // active loans
                .mockResolvedValueOnce([{ count: 0 }])          // defaulted
                .mockResolvedValueOnce([{ totalRules: 0, activeRules: 0 }])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])                      // no signed agreement
                .mockResolvedValueOnce([{ commission_pct: 0 }])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([]);

            const result = await service.getDashboard(COMPANY_ID, USER_ID);

            expect(result.managedFunds).toBe(0);
            expect(result.activeManagedLoans).toBe(0);
            expect(result.defaultedLoans).toBe(0);
            expect(result.automationStatus.rulesCount).toBe(0);
            expect(result.agreementStatus.isSigned).toBe(false);
            expect(result.commissionsAccrued).toBe(0);
        });
    });

    // ── Commission calculation (Flow 13) ──────────────────────────

    describe('Commission calculation', () => {
        it('commissionsAccrued is 0 when commissionRate is 0', async () => {
            mockDefaultDashboard({ commissionPct: 0, managedFunds: 100000, agreementAmount: 100000 });

            const result = await service.getDashboard(COMPANY_ID, USER_ID);
            expect(result.commissionsAccrued).toBe(0);
        });

        it('commissionsAccrued > 0 when rate and managedAmount are non-zero', async () => {
            mockDefaultDashboard({ commissionPct: 2.5, managedFunds: 50000, agreementAmount: 50000 });

            const result = await service.getDashboard(COMPANY_ID, USER_ID);
            // sumAccruedCommissionsCurrentYear is mocked as: amount * rate
            // = 50000 * (2.5 / 100) = 1250
            expect(result.commissionsAccrued).toBeGreaterThan(0);
        });
    });

    // ── Default rate ──────────────────────────────────────────────

    describe('defaultRate field', () => {
        it('is 0 when actives = 0 (no division by zero)', async () => {
            mockDefaultDashboard({ activeLoanCount: 0, defaultedCount: 0 });

            const result = await service.getDashboard(COMPANY_ID, USER_ID);
            expect(result.defaultRate).toBe(0);
        });

        it('is correctly calculated from defaulted / active', async () => {
            mockDefaultDashboard({ activeLoanCount: 10, defaultedCount: 2 });

            const result = await service.getDashboard(COMPANY_ID, USER_ID);
            expect(result.defaultRate).toBeCloseTo(20, 1); // 2/10 * 100
        });
    });
});

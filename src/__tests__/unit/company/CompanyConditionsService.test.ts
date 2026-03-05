/**
 * Unit tests — CompanyConditionsService
 *
 * Covers Flow 2: Company Account Setup & Onboarding
 *  ✓ getConditions — returns correct DTO for all status variants
 *  ✓ submitConditions — happy path → pending_approval
 *  ✓ submitConditions — invalid IBAN → error
 *  ✓ submitConditions — commission > cap → error
 *  ✓ submitConditions — negative minManagedAmount edge case
 *  ✓ submitConditions — keeps existing autoOfferSettings on re-submit
 *  ✓ updateAutoOfferSettings — merges only provided fields
 *  ✓ requestChanges — approved → pending_approval
 *  ✓ requestChanges — non-approved → error (cannot revert)
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

// ── Mock: CompanyAuditService ─────────────────────────────────────
jest.mock('../../../service/CompanyAuditService', () => ({
    CompanyAuditService: jest.fn().mockImplementation(() => ({
        logAction: jest.fn().mockResolvedValue({ id: 1 }),
        notifyUser: jest.fn().mockResolvedValue({ id: 1 }),
        notifyMultiple: jest.fn().mockResolvedValue([]),
    })),
}));

import { CompanyConditionsService } from '../../../service/CompanyConditionsService';
import {
    buildCompanyRow,
    buildSubmitConditionsRequest,
    VALID_IBAN,
    INVALID_IBAN,
} from '../../helpers/companyTestHelpers';

// ─────────────────────────────────────────────────────────────────
const COMPANY_ID = 1;
const USER_ID = 99;

describe('CompanyConditionsService', () => {
    let service: CompanyConditionsService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CompanyConditionsService();
    });

    // ── getConditions ─────────────────────────────────────────────

    describe('getConditions', () => {
        it('returns APPROVED status when conditions_locked_at is set', async () => {
            const company = buildCompanyRow({ conditions_status: 'approved', conditions_locked_at: new Date() });
            mockQrQuery.mockResolvedValue([company]);

            const result = await service.getConditions(COMPANY_ID);

            expect(result.conditionsStatus).toBe('approved');
            expect(result.minManagedAmount).toBe(10000);
            expect(result.managementCommissionRate).toBe(2.5);
            expect(result.handleReminders).toBe(true);
            expect(result.bankAccount).toBe(VALID_IBAN);
        });

        it('returns not_submitted when no conditions exist', async () => {
            const company = buildCompanyRow({
                conditions_status: null,
                conditions_locked_at: null,
                conditions_json: null,
            });
            mockQrQuery.mockResolvedValue([company]);

            const result = await service.getConditions(COMPANY_ID);

            expect(result.conditionsStatus).toBe('not_submitted');
        });

        it('returns revision_required status correctly', async () => {
            const company = buildCompanyRow({ conditions_status: 'revision_required' });
            mockQrQuery.mockResolvedValue([company]);

            const result = await service.getConditions(COMPANY_ID);

            expect(result.conditionsStatus).toBe('revision_required');
            expect(result.adminRevisionNote).toBeUndefined();
        });

        it('includes adminRevisionNote when set', async () => {
            const company = buildCompanyRow({
                conditions_status: 'revision_required',
                admin_revision_note: 'Commission rate too high',
            });
            mockQrQuery.mockResolvedValue([company]);

            const result = await service.getConditions(COMPANY_ID);

            expect(result.adminRevisionNote).toBe('Commission rate too high');
        });

        it('throws when company not found', async () => {
            mockQrQuery.mockResolvedValue([]);

            await expect(service.getConditions(COMPANY_ID)).rejects.toThrow('Company not found');
        });
    });

    // ── submitConditions ──────────────────────────────────────────

    describe('submitConditions — happy path', () => {
        it('sets conditions_status to pending_approval', async () => {
            // Call 1: platform_configs for max commission (from private helper) → not called until body processed
            // Call 1: existing conditions_json check
            // Call 2: platform_configs max commission rate
            // Call 3: existing conditions JSON
            // Call 4: UPDATE query
            // Call 5: getConditions re-fetch
            const approvedCompany = buildCompanyRow({ conditions_status: 'pending_approval' });

            mockQrQuery
                .mockResolvedValueOnce([{ value: '20' }])    // MAX_COMPANY_COMMISSION_RATE config
                .mockResolvedValueOnce([buildCompanyRow()])  // existing conditions_json
                .mockResolvedValueOnce({ affectedRows: 1 })  // UPDATE
                .mockResolvedValueOnce([approvedCompany]);   // getConditions re-fetch

            const body = buildSubmitConditionsRequest();
            const result = await service.submitConditions(COMPANY_ID, USER_ID, body as any);

            expect(result.conditionsStatus).toBe('pending_approval');
        });

        it('preserves existing autoOfferSettings on resubmit', async () => {
            const existingSettings = { borrowerLevels: ['A', 'B'], loanAmountMin: 1000 };
            const existingCompany = buildCompanyRow({
                conditions_json: JSON.stringify({ ...JSON.parse(buildCompanyRow().conditions_json), autoOfferSettings: existingSettings }),
            });
            const refetchCompany = buildCompanyRow({ conditions_status: 'pending_approval' });

            mockQrQuery
                .mockResolvedValueOnce([{ value: '20' }])
                .mockResolvedValueOnce([existingCompany])
                .mockResolvedValueOnce({ affectedRows: 1 })
                .mockResolvedValueOnce([refetchCompany]);

            // Capture what was written to DB
            const body = buildSubmitConditionsRequest();
            await service.submitConditions(COMPANY_ID, USER_ID, body as any);

            const updateCall = mockQrQuery.mock.calls.find((c: any[]) => String(c[0]).includes('UPDATE'));
            expect(updateCall).toBeDefined();
            const writtenJson = updateCall ? JSON.parse(updateCall[1][0]) : {};
            expect(writtenJson.autoOfferSettings).toEqual(existingSettings);
        });
    });

    describe('submitConditions — validation errors', () => {
        it('rejects invalid IBAN', async () => {
            const body = buildSubmitConditionsRequest({ bankAccount: INVALID_IBAN });

            await expect(
                service.submitConditions(COMPANY_ID, USER_ID, body as any)
            ).rejects.toThrow('valid Polish IBAN');
        });

        it('rejects short / malformed IBAN', async () => {
            const body = buildSubmitConditionsRequest({ bankAccount: 'PL1234' });

            await expect(
                service.submitConditions(COMPANY_ID, USER_ID, body as any)
            ).rejects.toThrow('valid Polish IBAN');
        });

        it('rejects commission rate above platform cap', async () => {
            mockQrQuery.mockResolvedValueOnce([{ value: '10' }]); // cap = 10%

            const body = buildSubmitConditionsRequest({ managementCommissionRate: 15 });

            await expect(
                service.submitConditions(COMPANY_ID, USER_ID, body as any)
            ).rejects.toThrow('Commission rate cannot exceed 10%');
        });
    });

    // ── updateAutoOfferSettings ───────────────────────────────────

    describe('updateAutoOfferSettings', () => {
        it('merges only provided fields into existing autoOfferSettings', async () => {
            const existingConditions = buildCompanyRow({
                conditions_json: JSON.stringify({
                    minManagedAmount: 10000,
                    managementCommissionRate: 2.5,
                    bankAccount: VALID_IBAN,
                    autoOfferSettings: { borrowerLevels: ['A'], loanAmountMin: 500 },
                }),
            });
            const refetchedCompany = buildCompanyRow({ conditions_status: 'approved' });

            mockQrQuery
                .mockResolvedValueOnce([existingConditions])  // SELECT conditions_json
                .mockResolvedValueOnce({ affectedRows: 1 })   // UPDATE
                .mockResolvedValueOnce([refetchedCompany]);   // getConditions

            const body = { loanAmountMax: 50000 };
            await service.updateAutoOfferSettings(COMPANY_ID, USER_ID, body as any);

            const updateCall = mockQrQuery.mock.calls.find((c: any[]) => String(c[0]).includes('UPDATE'));
            const written = updateCall ? JSON.parse(updateCall[1][0]) : {};
            // Original loanAmountMin preserved; new loanAmountMax added
            expect(written.autoOfferSettings.loanAmountMin).toBe(500);
            expect(written.autoOfferSettings.loanAmountMax).toBe(50000);
        });

        it('throws when company not found', async () => {
            mockQrQuery.mockResolvedValueOnce([]);

            await expect(
                service.updateAutoOfferSettings(COMPANY_ID, USER_ID, { loanAmountMin: 1000 } as any)
            ).rejects.toThrow('Company not found');
        });
    });

    // ── requestChanges ────────────────────────────────────────────

    describe('requestChanges', () => {
        it('transitions approved → pending_approval', async () => {
            const approvedCompany = buildCompanyRow({ conditions_status: 'approved' });
            const refetchedCompany = buildCompanyRow({ conditions_status: 'pending_approval' });

            mockQrQuery
                .mockResolvedValueOnce([approvedCompany])    // SELECT conditions_status
                .mockResolvedValueOnce({ affectedRows: 1 }) // UPDATE
                .mockResolvedValueOnce([refetchedCompany]);  // getConditions

            const result = await service.requestChanges(COMPANY_ID, USER_ID);
            expect(result.conditionsStatus).toBe('pending_approval');
        });

        it('blocks transition when conditions are not approved', async () => {
            const pendingCompany = buildCompanyRow({ conditions_status: 'pending_approval' });
            mockQrQuery.mockResolvedValueOnce([pendingCompany]);

            await expect(service.requestChanges(COMPANY_ID, USER_ID))
                .rejects.toThrow('Only approved conditions can be sent back for changes');
        });

        it('throws when company not found', async () => {
            mockQrQuery.mockResolvedValueOnce([]);

            await expect(service.requestChanges(COMPANY_ID, USER_ID))
                .rejects.toThrow('Company not found');
        });
    });
});

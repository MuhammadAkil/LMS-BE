/**
 * Unit tests — CompanyBulkService  (covers Flows 8, 9, 10)
 *
 * Flow 8: Reminders & Collections
 *  ✓ createBulkReminders — happy path (3 loans)
 *  ✓ createBulkReminders — empty loanIds → error
 *  ✓ createBulkReminders — company does not have access to some loans → error
 *
 * Flow 9: Court Claims
 *  ✓ createBulkClaims — happy path (defaulted loans)
 *  ✓ createBulkClaims — empty loanIds → error
 *  ✓ createBulkClaims — non-defaulted loans included → error (all must be defaulted)
 *
 * Flow 10: Bulk Actions — General
 *  ✓ exportCsv — happy path
 *  ✓ exportCsv — empty loanIds → error
 *  ✓ exportCsv — company access check fails → error
 *  ✓ exportXml — happy path
 *  ✓ exportXml — >500 loanIds → error (ExportLimitGuard enforces, service also guards)
 *  ✓ exportXml — empty loanIds → error
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

jest.mock('../../../services/s3.service', () => ({
    s3Service: {
        generateKey: jest.fn((_role: string, entityId: string, fileName: string) => `company/${entityId}/mock-${fileName}`),
        uploadFile: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../../../service/CompanyReportsService', () => ({
    CompanyReportsService: jest.fn().mockImplementation(() => ({
        getLoanRowsForExport: jest.fn().mockResolvedValue({
            rows: [{ id: 1001 }, { id: 1002 }, { id: 1003 }],
            commissionRate: 5,
        }),
        buildPortfolioXml: jest.fn().mockReturnValue('<?xml version="1.0"?><PortfolioReport/>'),
    })),
}));

jest.mock('../../../service/CompanyExportTemplateService', () => ({
    CompanyExportTemplateService: jest.fn().mockImplementation(() => ({
        resolveFieldKeys: jest.fn().mockResolvedValue(['id']),
    })),
}));

jest.mock('../../../repository/ExportRepository', () => ({
    ExportRepository: jest.fn().mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({ id: 77 }),
    })),
}));

import { CompanyBulkService } from '../../../service/CompanyBulkService';
import {
    buildBulkRemindersRequest,
    buildBulkClaimsRequest,
} from '../../helpers/companyTestHelpers';

// ─────────────────────────────────────────────────────────────────
const COMPANY_ID = 1;
const USER_ID = 99;

describe('CompanyBulkService', () => {
    let service: CompanyBulkService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CompanyBulkService();
    });

    // ── createBulkReminders ────────────────────────────────────────

    describe('createBulkReminders', () => {
        it('inserts reminders for all accessible loans', async () => {
            const loanIds = [1001, 1002, 1003];
            // Access check returns count = 3 (all valid)
            mockQrQuery
                .mockResolvedValueOnce([{ validCount: 3 }]) // access check
                .mockResolvedValue({ insertId: 1 });         // each INSERT (called 3 times)

            const request = buildBulkRemindersRequest(loanIds);
            const result = await service.createBulkReminders(COMPANY_ID, USER_ID, request as any);

            expect(result.reminderCount).toBe(3);
            expect(result.insertedAt).toBeInstanceOf(Date);
        });

        it('throws when loanIds array is empty', async () => {
            const request = buildBulkRemindersRequest([]);
            await expect(
                service.createBulkReminders(COMPANY_ID, USER_ID, request as any)
            ).rejects.toThrow('Loan IDs cannot be empty');
        });

        it('throws when company does not have access to some loans', async () => {
            const loanIds = [1001, 1002, 9999]; // 9999 not accessible
            mockQrQuery.mockResolvedValueOnce([{ validCount: 2 }]); // only 2 of 3 valid

            const request = buildBulkRemindersRequest(loanIds);
            await expect(
                service.createBulkReminders(COMPANY_ID, USER_ID, request as any)
            ).rejects.toThrow('Company does not have access to all specified loans');
        });
    });

    // ── createBulkClaims ──────────────────────────────────────────

    describe('createBulkClaims', () => {
        it('inserts claims for all defaulted loans', async () => {
            const loanIds = [2001, 2002];
            mockQrQuery
                .mockResolvedValueOnce([{ count: 2 }])   // defaulted check
                .mockResolvedValue({ insertId: 1 });      // each INSERT

            const request = buildBulkClaimsRequest(loanIds);
            const result = await service.createBulkClaims(COMPANY_ID, USER_ID, request as any);

            expect(result.itemCount).toBe(2);
            expect(result.type).toBe('CLAIMS');
            expect(result.status).toBe('COMPLETED');
        });

        it('throws when loanIds is empty', async () => {
            const request = buildBulkClaimsRequest([]);
            await expect(
                service.createBulkClaims(COMPANY_ID, USER_ID, request as any)
            ).rejects.toThrow('Loan IDs cannot be empty');
        });

        it('throws when any loan is not in DEFAULTED status (statusId=3)', async () => {
            const loanIds = [2001, 2002, 2003]; // 2003 not defaulted
            mockQrQuery.mockResolvedValueOnce([{ count: 2 }]); // only 2 defaulted

            const request = buildBulkClaimsRequest(loanIds);
            await expect(
                service.createBulkClaims(COMPANY_ID, USER_ID, request as any)
            ).rejects.toThrow('All loans must be in DEFAULTED status to create claims');
        });
    });

    // ── exportCsv ─────────────────────────────────────────────────

    describe('exportCsv', () => {
        it('creates export record and returns BulkActionResponse', async () => {
            const loanIds = [1001, 1002];
            mockQrQuery
                .mockResolvedValueOnce([{ validCount: 2 }])  // access check
                .mockResolvedValueOnce({ insertId: 42 });     // INSERT export

            const request = { loanIds, fileName: 'my_export.csv' };
            const result = await service.exportCsv(COMPANY_ID, USER_ID, request as any);

            expect(result.exportId).toBe(42);
            expect(result.type).toBe('CSV');
            expect(result.itemCount).toBe(2);
            expect(result.status).toBe('PENDING');
            expect(result.downloadUrl).toContain('/42/download');
        });

        it('throws when loanIds is empty', async () => {
            const request = { loanIds: [] as number[], fileName: 'empty.csv' };
            await expect(
                service.exportCsv(COMPANY_ID, USER_ID, request as any)
            ).rejects.toThrow('Loan IDs cannot be empty');
        });

        it('throws when company does not have access to all loans', async () => {
            const loanIds = [1001, 9999];
            mockQrQuery.mockResolvedValueOnce([{ validCount: 1 }]); // only 1 of 2

            const request = { loanIds, fileName: 'partial.csv' };
            await expect(
                service.exportCsv(COMPANY_ID, USER_ID, request as any)
            ).rejects.toThrow('Company does not have access to all specified loans');
        });
    });

    // ── exportXml ─────────────────────────────────────────────────

    describe('exportXml', () => {
        it('creates XML export and returns BulkActionResponse', async () => {
            const loanIds = [1001, 1002, 1003];
            const request = { loanIds };
            const result = await service.exportXml(COMPANY_ID, USER_ID, request as any);

            expect(result.exportId).toBe(77);
            expect(result.type).toBe('XML');
            expect(result.itemCount).toBe(3);
        });

        it('throws when more than 500 loanIds are provided', async () => {
            const loanIds = Array.from({ length: 501 }, (_, i) => i + 1);
            const request = { loanIds };

            await expect(
                service.exportXml(COMPANY_ID, USER_ID, request as any)
            ).rejects.toThrow('XML export limited to 500 loans per request');
        });

        it('throws when loanIds is empty', async () => {
            const request = { loanIds: [] as number[] };
            await expect(
                service.exportXml(COMPANY_ID, USER_ID, request as any)
            ).rejects.toThrow('Loan IDs cannot be empty');
        });
    });
});

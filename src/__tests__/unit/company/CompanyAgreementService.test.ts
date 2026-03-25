/**
 * Unit tests — CompanyAgreementService
 *
 * Covers Flow 4: Management Agreement
 *  ✓ getAgreement — returns null when no agreement exists
 *  ✓ getAgreement — returns UNSIGNED status when not yet signed
 *  ✓ getAgreement — returns SIGNED status when signedAt is set
 *  ✓ signAgreement — happy path; sets signedAt, creates contract, notifies
 *  ✓ signAgreement — already signed → blocks with error
 *  ✓ signAgreement — agreement not found → error
 *  ✓ downloadAgreement — returns PDF DTO when signed agreement exists
 *  ✓ downloadAgreement — throws when no signed agreement found
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

jest.mock('../../../service/CompanyRankingService', () => ({
    CompanyRankingService: jest.fn().mockImplementation(() => ({
        recomputeAllRanks: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('../../../services/s3.service', () => ({
    s3Service: {
        generateKey: jest.fn((role: string, id: string, name: string) => `${role}/${id}/${name}`),
        uploadFile: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../../../util/storedFileAccess', () => ({
    resolveStoredRefForDownload: jest.fn(),
}));

import { CompanyAgreementService } from '../../../service/CompanyAgreementService';
import { resolveStoredRefForDownload } from '../../../util/storedFileAccess';
import { buildAgreementRow } from '../../helpers/companyTestHelpers';

// ─────────────────────────────────────────────────────────────────
const COMPANY_ID = 1;
const USER_ID = 99;

describe('CompanyAgreementService', () => {
    let service: CompanyAgreementService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockQrQuery.mockReset();
        (resolveStoredRefForDownload as jest.Mock).mockReset();
        service = new CompanyAgreementService();
    });

    // ── getAgreement ──────────────────────────────────────────────

    describe('getAgreement', () => {
        it('returns null when no agreement record exists', async () => {
            mockQrQuery.mockResolvedValueOnce([]);

            const result = await service.getAgreement(COMPANY_ID);
            expect(result).toBeNull();
        });

        it('returns UNSIGNED status when signedAt is null', async () => {
            const row = buildAgreementRow({ signedAt: null });
            mockQrQuery.mockResolvedValueOnce([row]);

            const result = await service.getAgreement(COMPANY_ID);
            expect(result).not.toBeNull();
            expect(result!.status).toBe('UNSIGNED');
            expect(result!.amount).toBe(50000);
        });

        it('returns SIGNED status when signedAt is set', async () => {
            const row = buildAgreementRow({ signedAt: new Date('2025-02-01') });
            mockQrQuery.mockResolvedValueOnce([row]);

            const result = await service.getAgreement(COMPANY_ID);
            expect(result!.status).toBe('SIGNED');
            expect(result!.signedAt).toEqual(new Date('2025-02-01'));
        });
    });

    // ── signAgreement ─────────────────────────────────────────────

    describe('signAgreement — happy path', () => {
        it('updates signedAt, creates contract record, sends notifications', async () => {
            const unsignedRow = buildAgreementRow({
                signedAt: null,
                lenderSignedAt: new Date('2025-01-10T00:00:00Z'),
            });
            const signedRow = buildAgreementRow({ signedAt: new Date() });

            jest.spyOn(CompanyAgreementService.prototype as any, 'generateManagementAgreementPdf').mockResolvedValue(
                Buffer.from('pdf-bytes')
            );

            mockQrQuery
                .mockResolvedValueOnce([unsignedRow])
                .mockResolvedValueOnce({ affectedRows: 1 })
                .mockResolvedValueOnce({ affectedRows: 1 })
                .mockResolvedValueOnce({ insertId: 300 })
                .mockResolvedValueOnce([{ id: 1 }])
                .mockResolvedValueOnce([signedRow]);

            const request = { agreementId: 200, signatureData: 'base64sig' };
            const result = await service.signAgreement(COMPANY_ID, USER_ID, request as any);

            expect(result!.status).toBe('SIGNED');

            const insertCall = mockQrQuery.mock.calls.find(
                (c: any[]) => String(c[0]).includes('INSERT') && String(c[0]).includes('contracts')
            );
            expect(insertCall).toBeDefined();
        });
    });

    describe('signAgreement — error cases', () => {
        it('throws when agreement not found', async () => {
            mockQrQuery.mockResolvedValueOnce([]); // not found

            await expect(
                service.signAgreement(COMPANY_ID, USER_ID, { agreementId: 9999 } as any)
            ).rejects.toThrow('Agreement not found');
        });

        it('throws when agreement is already signed (idempotency guard)', async () => {
            const alreadySigned = buildAgreementRow({ signedAt: new Date() });
            mockQrQuery.mockResolvedValueOnce([alreadySigned]);

            await expect(
                service.signAgreement(COMPANY_ID, USER_ID, { agreementId: 200 } as any)
            ).rejects.toThrow('Agreement already fully signed');
        });
    });

    // ── downloadAgreement ─────────────────────────────────────────

    describe('downloadAgreement', () => {
        it('returns presigned URL DTO when file is remote', async () => {
            const contractRow = { id: 300, filePath: 'company/1/agreement.pdf', createdAt: new Date() };
            mockQrQuery.mockResolvedValueOnce([contractRow]);
            (resolveStoredRefForDownload as jest.Mock).mockResolvedValueOnce({
                mode: 'remote',
                url: 'https://example.com/presigned',
            });

            const result = await service.downloadAgreement(COMPANY_ID);

            expect(result.contractId).toBe(300);
            expect(result.contentType).toBe('application/pdf');
            expect(result.url).toBe('https://example.com/presigned');
            expect(result.expiresIn).toBe(3600);
        });

        it('throws when no signed agreement contract exists', async () => {
            mockQrQuery.mockResolvedValueOnce([]); // no contract

            await expect(service.downloadAgreement(COMPANY_ID))
                .rejects.toThrow('No signed agreement found');
        });
    });
});

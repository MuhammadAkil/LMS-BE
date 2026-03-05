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

import { CompanyAgreementService } from '../../../service/CompanyAgreementService';
import { buildAgreementRow } from '../../helpers/companyTestHelpers';

// ─────────────────────────────────────────────────────────────────
const COMPANY_ID = 1;
const USER_ID = 99;

describe('CompanyAgreementService', () => {
    let service: CompanyAgreementService;

    beforeEach(() => {
        jest.clearAllMocks();
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
            const unsignedRow = buildAgreementRow({ signedAt: null });
            const signedRow = buildAgreementRow({ signedAt: new Date() });

            mockQrQuery
                .mockResolvedValueOnce([unsignedRow])          // SELECT agreement
                .mockResolvedValueOnce({ affectedRows: 1 })    // UPDATE signedAt
                .mockResolvedValueOnce({ insertId: 300 })      // INSERT contract
                .mockResolvedValueOnce([{ id: 1 }])            // SELECT admins
                .mockResolvedValueOnce([signedRow]);            // getAgreement re-fetch

            const request = { agreementId: 200, signatureData: 'base64sig' };
            const result = await service.signAgreement(COMPANY_ID, USER_ID, request as any);

            expect(result.status).toBe('SIGNED');

            // Verify contract was inserted
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
            ).rejects.toThrow('Agreement already signed');
        });
    });

    // ── downloadAgreement ─────────────────────────────────────────

    describe('downloadAgreement', () => {
        it('returns PDF DTO for signed agreement', async () => {
            const contractRow = { id: 300, filePath: '/generated_pdfs/contract_1.pdf', createdAt: new Date() };
            mockQrQuery.mockResolvedValueOnce([contractRow]);

            const result = await service.downloadAgreement(COMPANY_ID);

            expect(result.contractId).toBe(300);
            expect(result.contentType).toBe('application/pdf');
            expect(result.fileName).toContain(`management_agreement_${COMPANY_ID}`);
            expect(result.data).toBeInstanceOf(Buffer);
        });

        it('throws when no signed agreement contract exists', async () => {
            mockQrQuery.mockResolvedValueOnce([]); // no contract

            await expect(service.downloadAgreement(COMPANY_ID))
                .rejects.toThrow('No signed agreement found');
        });
    });
});

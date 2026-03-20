import { AppDataSource } from '../config/database';
import { CompanyAuditService } from './CompanyAuditService';
import { CompanyRankingService } from './CompanyRankingService';
import {
    CompanyAgreementResponse,
    SignAgreementRequest,
    AgreementDownloadResponse,
} from '../dto/CompanyDtos';
import { s3Service } from '../services/s3.service';

/**
 * Company Agreement Service
 * Manages management_agreements lifecycle
 *
 * Fintech compliance:
 * - Agreement must be signed to unlock operational actions
 * - signed_at timestamp is immutable evidence of signing
 * - Generates contract record in contracts table
 * - Triggers notification to all stakeholders
 */
export class CompanyAgreementService {
    private auditService: CompanyAuditService;
    private rankingService: CompanyRankingService;

    constructor() {
        this.auditService = new CompanyAuditService();
        this.rankingService = new CompanyRankingService();
    }

    /**
     * Get management agreement for company (first by creation order)
     * Returns current agreement status and bilateral signing state
     */
    async getAgreement(companyId: number): Promise<CompanyAgreementResponse | null> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const agreement = await queryRunner.query(
                `
        SELECT 
          id, companyId, amount, signedAt, createdAt,
          lender_signed_at AS lenderSignedAt, company_signed_at AS companySignedAt,
          signed_document_path AS signedDocumentPath
        FROM management_agreements
        WHERE companyId = ?
        ORDER BY createdAt DESC
        LIMIT 1
        `,
                [companyId]
            );

            if (!agreement || agreement.length === 0) return null;

            const row = agreement[0];
            const signingStatus = row.signedAt
                ? 'SIGNED'
                : row.companySignedAt
                    ? 'SIGNED'
                    : row.lenderSignedAt
                        ? 'PENDING_COMPANY'
                        : 'PENDING_LENDER';

            return {
                id: row.id,
                companyId: row.companyId,
                amount: parseFloat(row.amount || 0),
                signedAt: row.signedAt,
                contractId: undefined,
                createdAt: row.createdAt,
                updatedAt: row.createdAt,
                status: row.signedAt ? 'SIGNED' : 'UNSIGNED',
                signingStatus,
                lenderSignedAt: row.lenderSignedAt,
                companySignedAt: row.companySignedAt,
                signedDocumentPath: row.signedDocumentPath,
            };
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * List agreements pending company signature (lender already signed)
     */
    async getAgreementsPendingCompanySign(companyId: number): Promise<CompanyAgreementResponse[]> {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const rows = await queryRunner.query(
                `
        SELECT ma.id, ma.companyId, ma.amount, ma.createdAt,
               ma.lender_signed_at AS lenderSignedAt, ma.lender_signer_name AS lenderSignerName, ma.lender_signer_role AS lenderSignerRole,
               u.email AS lenderEmail,
               COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),''), u.email) AS lenderName
        FROM management_agreements ma
        INNER JOIN users u ON u.id = ma.lenderId
        WHERE ma.companyId = ? AND ma.terminated_at IS NULL
          AND ma.lender_signed_at IS NOT NULL AND ma.company_signed_at IS NULL
        ORDER BY ma.lender_signed_at DESC
        `,
                [companyId]
            );
            return (rows || []).map((r: any): CompanyAgreementResponse => ({
                id: r.id,
                companyId: r.companyId,
                amount: parseFloat(r.amount || 0),
                signedAt: undefined,
                createdAt: r.createdAt,
                updatedAt: r.createdAt,
                status: 'UNSIGNED',
                signingStatus: 'PENDING_COMPANY',
                lenderSignedAt: r.lenderSignedAt,
                lenderName: r.lenderName || r.lenderEmail,
                lenderEmail: r.lenderEmail,
            }));
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Company signs management agreement (bilateral flow).
     * Saves company signer name, role, signature. When lender has already signed,
     * sets signedAt, creates contract record, generates and stores signed PDF.
     */
    async signAgreement(
        companyId: number,
        userId: number,
        request: SignAgreementRequest
    ): Promise<CompanyAgreementResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            const agreementRows = await queryRunner.query(
                `
        SELECT id, signedAt, lender_signed_at AS lenderSignedAt, company_signed_at AS companySignedAt,
               lender_signer_name AS lenderSignerName, lender_signer_role AS lenderSignerRole
        FROM management_agreements
        WHERE companyId = ? AND id = ?
        `,
                [companyId, request.agreementId]
            );

            if (!agreementRows?.length) throw new Error('Agreement not found');
            if (agreementRows[0].signedAt) throw new Error('Agreement already fully signed');
            if (agreementRows[0].companySignedAt) throw new Error('Company has already signed this agreement');

            const now = new Date();
            const agreementId = request.agreementId;
            const lenderAlreadySigned = !!agreementRows[0].lenderSignedAt;

            // 1. Update company signing fields
            await queryRunner.query(
                `
        UPDATE management_agreements
        SET company_signed_at = ?, company_signer_name = ?, company_signer_role = ?, company_signature_data = ?
        WHERE id = ? AND companyId = ?
        `,
                [
                    now,
                    request.signerName?.trim() || null,
                    request.signerRole?.trim() || null,
                    request.signatureData || null,
                    agreementId,
                    companyId,
                ]
            );

            let contractId: number | undefined;
            let signedDocPath: string | null = null;
            let signedDocKey: string | null = null;

            if (lenderAlreadySigned) {
                // 2. Set fully signed timestamp and generate stored document
                const fileName = `management_agreement_${agreementId}_${now.toISOString().replace(/[:.]/g, '-')}.pdf`;
                const pdfBuffer = await this.generateManagementAgreementPdf(queryRunner, agreementId, companyId);
                signedDocKey = s3Service.generateKey('company', String(companyId), fileName);
                await s3Service.uploadFile(pdfBuffer, signedDocKey, 'application/pdf');
                signedDocPath = signedDocKey;

                await queryRunner.query(
                    `UPDATE management_agreements SET signedAt = ?, signed_document_path = ?, document_key = ? WHERE id = ? AND companyId = ?`,
                    [now, signedDocPath, signedDocKey, agreementId, companyId]
                );

                const contractResult = await queryRunner.query(
                    `
        INSERT INTO contracts (company_id, management_agreement_id, contract_type, signed_at, file_path, document_key, created_at)
        VALUES (?, ?, 'MANAGEMENT_AGREEMENT', ?, ?, ?, NOW())
        `,
                    [companyId, agreementId, now, signedDocPath, signedDocKey]
                );
                contractId = contractResult.insertId;
            }

            await this.auditService.logAction(userId, 'AGREEMENT_SIGNED', 'MANAGEMENT_AGREEMENT', agreementId, {
                companyId,
                contractId,
                signedAt: now,
                signatureData: request.signatureData ? 'provided' : 'none',
            });

            await this.auditService.notifyUser(userId, 'AGREEMENT_SIGNED', {
                title: 'Agreement Signed',
                message: lenderAlreadySigned
                    ? 'Management agreement has been fully signed. Document stored.'
                    : 'Your signature has been recorded. Agreement is pending lender signature.',
                agreementId,
                contractId,
                timestamp: now,
            });

            if (lenderAlreadySigned && contractId) {
                const adminUsers = await queryRunner.query('SELECT id FROM users WHERE role_id = 1 LIMIT 10');
                const adminIds = (adminUsers || []).map((u: any) => u.id);
                if (adminIds.length > 0) {
                    await this.auditService.notifyMultiple(adminIds, 'COMPANY_AGREEMENT_SIGNED', {
                        title: 'Company agreement signed',
                        message: `Company ${companyId} has signed management agreement`,
                        companyId,
                        agreementId,
                        contractId,
                        timestamp: now,
                    });
                }
                await this.rankingService.recomputeAllRanks();
            }

            const out = await this.getAgreement(companyId);
            return out!;
        } finally {
            await queryRunner.release();
        }
    }

    private async generateManagementAgreementPdf(qr: any, agreementId: number, companyId: number): Promise<Buffer> {
        const rows = await qr.query(
            `SELECT ma.amount, ma.lender_signer_name AS ln, ma.lender_signer_role AS lr, ma.lender_signed_at AS ls,
                    ma.company_signer_name AS cn, ma.company_signer_role AS cr, ma.company_signed_at AS cs,
                    c.name AS companyName
             FROM management_agreements ma
             INNER JOIN companies c ON c.id = ma.companyId
             WHERE ma.id = ? AND ma.companyId = ?`,
            [agreementId, companyId]
        );
        const r = rows?.[0] || {};
        const PDFDocument = require('pdfkit');
        return new Promise<Buffer>((resolve, reject) => {
            const doc = (PDFDocument as any)({ margin: 50, size: 'A4' });
            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            doc.fontSize(16).text('Management Agreement', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).text(`Agreement ID: ${agreementId}  |  Company: ${r.companyName || companyId}`);
            doc.text(`Amount: ${Number(r.amount || 0).toFixed(2)} PLN`);
            doc.moveDown();
            doc.text('Lender:', { continued: false }).text(`  ${r.ln || '—'} (${r.lr || '—'})  Signed: ${r.ls ? new Date(r.ls).toISOString() : '—'}`);
            doc.text('Company:', { continued: false }).text(`  ${r.cn || '—'} (${r.cr || '—'})  Signed: ${r.cs ? new Date(r.cs).toISOString() : '—'}`);
            doc.moveDown(2).fontSize(8).text('This document was generated upon bilateral signing and is stored for record.', { align: 'center' });
            doc.end();
        });
    }

    /**
     * Download agreement (PDF contract) as presigned URL
     */
    async downloadAgreement(companyId: number): Promise<AgreementDownloadResponse> {
        const queryRunner = AppDataSource.createQueryRunner();

        try {
            // Get signed agreement with contract
            const contract = await queryRunner.query(
                `
        SELECT 
          c.id,
          c.file_path as filePath,
          c.document_key as documentKey,
          c.created_at as createdAt
        FROM contracts c
        INNER JOIN management_agreements ma ON c.management_agreement_id = ma.id
        WHERE ma.companyId = ? AND ma.signedAt IS NOT NULL
        ORDER BY c.created_at DESC
        LIMIT 1
        `,
                [companyId]
            );

            if (!contract || contract.length === 0) {
                throw new Error('No signed agreement found');
            }

            const key = contract[0].documentKey || contract[0].filePath;
            if (!key) {
                throw new Error('No agreement file key found');
            }
            const expiresIn = 3600;
            const url = await s3Service.getPresignedUrl(key, expiresIn);

            return {
                contractId: contract[0].id,
                fileName: `management_agreement_${companyId}_${new Date().toISOString().split('T')[0]}.pdf`,
                contentType: 'application/pdf',
                key,
                url,
                expiresIn,
                createdAt: contract[0].createdAt,
            };
        } finally {
            await queryRunner.release();
        }
    }
}

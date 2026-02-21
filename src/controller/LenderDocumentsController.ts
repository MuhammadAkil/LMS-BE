import { Controller, Get, Req, Res, UseBefore } from 'routing-controllers';
import { Request, Response } from 'express';
import { LoanOfferRepository } from '../repository/LoanOfferRepository';
import { ManagementAgreementRepository } from '../repository/ManagementAgreementRepository';
import { ClaimRepository } from '../repository/ClaimRepository';
import { ExportRepository } from '../repository/ExportRepository';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { LenderRoleGuard } from '../middleware/LenderGuards';

/**
 * LENDER DOCUMENTS CONTROLLER
 * GET /lender/documents
 * Aggregates documents from: investments (contracts), management agreements, claims, exports
 */
@Controller('/lender')
@UseBefore(AuthenticationMiddleware.verifyToken, LenderRoleGuard)
export class LenderDocumentsController {
    private loanOfferRepo: LoanOfferRepository;
    private managementAgreementRepo: ManagementAgreementRepository;
    private claimRepo: ClaimRepository;
    private exportRepo: ExportRepository;

    constructor() {
        this.loanOfferRepo = new LoanOfferRepository();
        this.managementAgreementRepo = new ManagementAgreementRepository();
        this.claimRepo = new ClaimRepository();
        this.exportRepo = new ExportRepository();
    }

    /**
     * GET /lender/documents
     * Returns all documents for the lender, optionally filtered by category
     * Query params: category (loan-agreement|management-agreement|claim|export), page, pageSize
     */
    @Get('/documents')
    async getDocuments(@Req() req: Request, @Res() res: Response): Promise<void> {
        try {
            const lenderId = (req as any).user?.id;
            if (!lenderId) {
                res.status(401).json({
                    statusCode: '401',
                    statusMessage: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const category = (req.query.category as string) || 'all';
            const page = Math.max(1, parseInt((req.query.page as string) || '1'));
            const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || '20')));

            const documents: object[] = [];

            // Loan Agreements (from loan_offers with contract PDF)
            if (category === 'all' || category === 'loan-agreement') {
                const offers = await this.loanOfferRepo.findByLenderId(lenderId);
                for (const offer of offers) {
                    if ((offer as any).contractPdfUrl || (offer as any).contract_pdf_url) {
                        documents.push({
                            id: `loan-agreement-${offer.id}`,
                            category: 'Loan Agreement',
                            title: `Loan Agreement #${offer.loanId}`,
                            fileUrl: (offer as any).contractPdfUrl || (offer as any).contract_pdf_url,
                            createdAt: offer.createdAt?.toISOString?.() ?? new Date().toISOString(),
                            relatedEntityId: String(offer.loanId),
                        });
                    }
                }
            }

            // Management Agreements
            if (category === 'all' || category === 'management-agreement') {
                const agreements = await this.managementAgreementRepo.findByLenderId(lenderId);
                for (const agreement of agreements) {
                    if ((agreement as any).pdfPath) {
                        documents.push({
                            id: `management-agreement-${agreement.id}`,
                            category: 'Management Agreement',
                            title: `Management Agreement #${agreement.id}`,
                            fileUrl: (agreement as any).pdfPath,
                            createdAt: (agreement as any).signedAt?.toISOString?.() ?? new Date().toISOString(),
                            relatedEntityId: String(agreement.id),
                        });
                    }
                }
            }

            // Claims
            if (category === 'all' || category === 'claim') {
                const [allClaims] = await this.claimRepo.findAll(200, 0);
                const lenderClaims = allClaims.filter(
                    (c: any) => c.lenderId === lenderId || c.createdBy === lenderId
                );
                for (const claim of lenderClaims) {
                    documents.push({
                        id: `claim-${claim.id}`,
                        category: 'Claim',
                        title: `Court Claim #${claim.id}`,
                        fileUrl: (claim as any).xmlPath || (claim as any).documentUrl || '',
                        createdAt: (claim as any).generatedAt?.toISOString?.() ?? new Date().toISOString(),
                        relatedEntityId: String((claim as any).loanId),
                    });
                }
            }

            // Exports
            if (category === 'all' || category === 'export') {
                const [exports] = await this.exportRepo.findByCreatedBy(lenderId, 100, 0);
                for (const exp of exports) {
                    documents.push({
                        id: `export-${exp.id}`,
                        category: 'Export',
                        title: `Export #${exp.id} (${(exp as any).exportTypeCode || 'CSV'})`,
                        fileUrl: (exp as any).filePath || '',
                        createdAt: exp.createdAt?.toISOString?.() ?? new Date().toISOString(),
                        relatedEntityId: String(exp.id),
                    });
                }
            }

            // Apply pagination
            const totalItems = documents.length;
            const offset = (page - 1) * pageSize;
            const paginatedDocs = documents.slice(offset, offset + pageSize);

            res.status(200).json({
                statusCode: '200',
                statusMessage: 'Documents retrieved successfully',
                data: {
                    documents: paginatedDocs,
                    pagination: {
                        page,
                        pageSize,
                        totalItems,
                        totalPages: Math.ceil(totalItems / pageSize),
                    },
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Error in LenderDocumentsController.getDocuments:', error);
            res.status(500).json({
                statusCode: '500',
                statusMessage: 'Failed to retrieve documents',
                errors: [error.message],
                timestamp: new Date().toISOString(),
            });
        }
    }
}

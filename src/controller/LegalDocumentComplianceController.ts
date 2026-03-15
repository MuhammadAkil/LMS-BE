import { Controller, Get, Post, Body, UseBefore, Req, Res } from 'routing-controllers';
import { Request, Response } from 'express';
import { LegalDocumentComplianceService } from '../service/AdminLegalDocumentsService';
import { AuthenticationMiddleware } from '../middleware/AuthenticationMiddleware';
import { ComplianceGuard } from '../middleware/ComplianceGuard';
import type { PendingLegalDocumentDto, AcceptLegalDocumentRequest } from '../dto/LegalDocumentDtos';

/**
 * User-facing: pending legal documents and accept.
 * Used by borrower, lender, and company roles.
 * Users are prompted on next login and cannot proceed until mandatory ones are accepted.
 */
@Controller('/legal-documents')
@UseBefore(AuthenticationMiddleware.verifyToken, ComplianceGuard)
export class LegalDocumentComplianceController {
    private readonly service: LegalDocumentComplianceService;

    constructor() {
        this.service = new LegalDocumentComplianceService();
    }

    @Get('/pending')
    async getPending(@Req() req: Request, @Res() res: Response): Promise<void> {
        const userId = Number((req as any).user?.id);
        const roleId = Number((req as any).user?.roleId);
        const pending = await this.service.getPendingForUser(userId, roleId);
        res.status(200).json({
            statusCode: '200',
            statusMessage: 'OK',
            data: pending as PendingLegalDocumentDto[],
            timestamp: new Date().toISOString(),
        });
    }

    @Post('/accept')
    async accept(@Req() req: Request, @Body() body: AcceptLegalDocumentRequest, @Res() res: Response): Promise<void> {
        const userId = Number((req as any).user?.id);
        const documentVersionId = Number(body.documentVersionId);
        const ip = (req as any).headers?.['x-forwarded-for'] ?? (req as any).connection?.remoteAddress ?? null;
        await this.service.acceptDocument(userId, documentVersionId, ip);
        res.status(200).json({
            statusCode: '200',
            statusMessage: 'Document accepted',
            timestamp: new Date().toISOString(),
        });
    }
}

import { Controller, Get, Post, Patch, Delete, Body, Param, QueryParam, UseBefore, Req, Res } from 'routing-controllers';
import { Request, Response } from 'express';
import { AdminLegalDocumentsService } from '../service/AdminLegalDocumentsService';
import { AdminGuard, SuperAdminGuard } from '../middleware/AdminGuards';
import type {
    LegalDocumentDto,
    LegalDocumentVersionDto,
    LegalDocumentAssignmentDto,
    LegalDocumentAcceptanceLogDto,
    CreateLegalDocumentRequest,
    UpdateLegalDocumentRequest,
    CreateLegalDocumentVersionRequest,
    SetLegalDocumentAssignmentsRequest,
} from '../dto/LegalDocumentDtos';

/**
 * Admin: Legal / compliance document management
 * - CRUD document types, versions, assignments
 * - View acceptance logs
 */
@Controller('/admin/legal-documents')
@UseBefore(AdminGuard)
export class AdminLegalDocumentsController {
    private readonly service: AdminLegalDocumentsService;

    constructor() {
        this.service = new AdminLegalDocumentsService();
    }

    @Get('/')
    async listDocuments(
        @QueryParam('limit') limit?: number,
        @QueryParam('offset') offset?: number
    ): Promise<{ items: LegalDocumentDto[]; total: number }> {
        return this.service.listDocuments(limit ?? 50, offset ?? 0);
    }

    @Get('/acceptance-logs')
    async getAcceptanceLogs(
        @QueryParam('documentId') documentId?: number,
        @QueryParam('userId') userId?: number,
        @QueryParam('limit') limit?: number,
        @QueryParam('offset') offset?: number
    ): Promise<{ items: LegalDocumentAcceptanceLogDto[]; total: number }> {
        return this.service.getAcceptanceLogs({
            documentId: documentId != null ? Number(documentId) : undefined,
            userId: userId != null ? Number(userId) : undefined,
            limit: limit != null ? Number(limit) : undefined,
            offset: offset != null ? Number(offset) : undefined,
        });
    }

    @Get('/:id')
    async getDocument(@Param('id') id: number): Promise<LegalDocumentDto & { assignments: LegalDocumentAssignmentDto[]; latestVersion?: LegalDocumentVersionDto }> {
        return this.service.getDocumentById(id);
    }

    @Post('/')
    @UseBefore(SuperAdminGuard)
    async createDocument(@Body() body: CreateLegalDocumentRequest, @Res() res: Response): Promise<void> {
        const doc = await this.service.createDocument(body);
        res.status(201).json({ statusCode: '201', statusMessage: 'Document created', data: doc, timestamp: new Date().toISOString() });
    }

    @Patch('/:id')
    @UseBefore(SuperAdminGuard)
    async updateDocument(@Param('id') id: number, @Body() body: UpdateLegalDocumentRequest, @Res() res: Response): Promise<void> {
        const doc = await this.service.updateDocument(id, body);
        res.status(200).json({ statusCode: '200', statusMessage: 'Document updated', data: doc, timestamp: new Date().toISOString() });
    }

    @Delete('/:id')
    @UseBefore(SuperAdminGuard)
    async deleteDocument(@Param('id') id: number, @Res() res: Response): Promise<void> {
        await this.service.deleteDocument(id);
        res.status(200).json({ statusCode: '200', statusMessage: 'Document deleted', timestamp: new Date().toISOString() });
    }

    @Get('/:id/versions')
    async listVersions(@Param('id') documentId: number): Promise<LegalDocumentVersionDto[]> {
        return this.service.listVersions(documentId);
    }

    @Post('/:id/versions')
    @UseBefore(SuperAdminGuard)
    async createVersion(
        @Param('id') documentId: number,
        @Body() body: CreateLegalDocumentVersionRequest,
        @Res() res: Response
    ): Promise<void> {
        const version = await this.service.createVersion(documentId, body);
        res.status(201).json({ statusCode: '201', statusMessage: 'Version created; affected users must re-accept', data: version, timestamp: new Date().toISOString() });
    }

    @Patch('/:id/assignments')
    @UseBefore(SuperAdminGuard)
    async setAssignments(
        @Param('id') documentId: number,
        @Body() body: SetLegalDocumentAssignmentsRequest,
        @Res() res: Response
    ): Promise<void> {
        const assignments = await this.service.setAssignments(documentId, body);
        res.status(200).json({ statusCode: '200', statusMessage: 'Assignments updated', data: assignments, timestamp: new Date().toISOString() });
    }
}

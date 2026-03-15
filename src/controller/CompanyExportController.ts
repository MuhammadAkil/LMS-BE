import { Controller, Get, Post, Put, Delete, UseBefore, Req, Body, Param } from 'routing-controllers';
import { Request } from 'express';
import { CompanyExportTemplateService } from '../service/CompanyExportTemplateService';
import { CompanyGuard, CompanyStatusGuard, ConditionsApprovedGuard } from '../middleware/CompanyGuards';
import {
    CreateCompanyExportTemplateRequest,
    UpdateCompanyExportTemplateRequest,
    CompanyExportTemplateResponse,
} from '../dto/CompanyDtos';
import { CompanyExportFieldDef } from '../util/CompanyExportFields';

/**
 * Company Export – available fields and saved templates
 *
 * GET  /api/company/export/fields           — list allowed XML export fields (key, label, description)
 * GET  /api/company/export-templates       — list templates for this company
 * POST /api/company/export-templates       — create template (name, fieldKeys)
 * PUT  /api/company/export-templates/:id   — update template
 * DELETE /api/company/export-templates/:id — delete template
 */
@Controller('/company')
@UseBefore(CompanyGuard, CompanyStatusGuard, ConditionsApprovedGuard)
export class CompanyExportController {
    private readonly templateService = new CompanyExportTemplateService();

    @Get('/export/fields')
    getExportFields(): CompanyExportFieldDef[] {
        return this.templateService.getAvailableFields();
    }

    @Get('/export-templates')
    async listTemplates(@Req() req: Request): Promise<CompanyExportTemplateResponse[]> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');
        return this.templateService.listTemplates(companyId);
    }

    @Post('/export-templates')
    async createTemplate(
        @Req() req: Request,
        @Body() body: CreateCompanyExportTemplateRequest
    ): Promise<CompanyExportTemplateResponse> {
        const companyId = (req.user as any)?.companyId;
        const userId = (req.user as any)?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found in request');
        return this.templateService.createTemplate(companyId, userId, body);
    }

    @Put('/export-templates/:id')
    async updateTemplate(
        @Req() req: Request,
        @Param('id') id: number,
        @Body() body: UpdateCompanyExportTemplateRequest
    ): Promise<CompanyExportTemplateResponse | null> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');
        const templateId = Number(id);
        if (!templateId) throw new Error('Invalid template ID');
        return this.templateService.updateTemplate(companyId, templateId, body);
    }

    @Delete('/export-templates/:id')
    async deleteTemplate(@Req() req: Request, @Param('id') id: number): Promise<{ deleted: boolean }> {
        const companyId = (req.user as any)?.companyId;
        if (!companyId) throw new Error('Company ID not found in request');
        const templateId = Number(id);
        if (!templateId) throw new Error('Invalid template ID');
        const deleted = await this.templateService.deleteTemplate(companyId, templateId);
        return { deleted };
    }
}

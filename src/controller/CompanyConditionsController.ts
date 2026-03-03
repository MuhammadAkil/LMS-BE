import { Controller, Get, Post, Put, UseBefore, Req, Body } from 'routing-controllers';
import { Request } from 'express';
import { CompanyConditionsService } from '../service/CompanyConditionsService';
import { CompanyGuard, CompanyReadonlyGuard } from '../middleware/CompanyGuards';
import {
    CompanyConditionsResponse,
    SubmitConditionsRequest,
    UpdateAutoOfferSettingsRequest,
} from '../dto/CompanyDtos';

/**
 * GET  /api/company/conditions
 * POST /api/company/conditions           — submit (first time or resubmit after revision)
 * PUT  /api/company/conditions            — update auto-offer settings only (no re-approval)
 * POST /api/company/conditions/request-changes — reopen approved for editing
 */
@Controller('/company/conditions')
@UseBefore(CompanyGuard, CompanyReadonlyGuard)
export class CompanyConditionsController {
    private readonly conditionsService: CompanyConditionsService;

    constructor() {
        this.conditionsService = new CompanyConditionsService();
    }

    @Get('')
    async getConditions(@Req() req: Request): Promise<CompanyConditionsResponse> {
        const companyId = (req as any).user?.companyId;
        if (!companyId) throw new Error('Company ID not found');
        return this.conditionsService.getConditions(companyId);
    }

    @Post('')
    async submitConditions(
        @Req() req: Request,
        @Body() body: SubmitConditionsRequest
    ): Promise<CompanyConditionsResponse> {
        const companyId = (req as any).user?.companyId;
        const userId = (req as any).user?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found');
        return this.conditionsService.submitConditions(companyId, userId, body);
    }

    @Put('')
    async updateAutoOfferSettings(
        @Req() req: Request,
        @Body() body: UpdateAutoOfferSettingsRequest
    ): Promise<CompanyConditionsResponse> {
        const companyId = (req as any).user?.companyId;
        const userId = (req as any).user?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found');
        return this.conditionsService.updateAutoOfferSettings(companyId, userId, body);
    }

    @Post('/request-changes')
    async requestChanges(@Req() req: Request): Promise<CompanyConditionsResponse> {
        const companyId = (req as any).user?.companyId;
        const userId = (req as any).user?.id;
        if (!companyId || !userId) throw new Error('Company ID or User ID not found');
        return this.conditionsService.requestChanges(companyId, userId);
    }
}

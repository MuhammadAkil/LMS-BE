import { Controller, Get, Post, Patch, Put, Delete, Body, Param, QueryParam, UseBefore, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminCompaniesService } from '../service/AdminCompaniesService';
import { AdminGuard, SuperAdminGuard } from '../middleware/AdminGuards';
import {
  CompanyListItemDto,
  CompanyDetailDto,
  ApproveCompanyRequest,
  RejectCompanyRequest,
  UpdateCompanyConditionsRequest,
  CreateCompanyRequest,
  CreateCompanyResponse,
} from '../dto/AdminDtos';

/**
 * Admin Companies Controller
 * Endpoints for company management (approvals, rejections, conditions)
 *
 * Routes:
 * - GET   /admin/companies                    -> List companies (AdminGuard)
 * - GET   /admin/companies/pending            -> List pending companies (AdminGuard)
 * - GET   /admin/companies/:id                -> Get company details (AdminGuard)
 * - POST  /admin/companies/:id/approve        -> Approve company (SuperAdminGuard)
 * - POST  /admin/companies/:id/reject         -> Reject company (SuperAdminGuard)
 * - PATCH /admin/companies/:id/conditions     -> Update conditions (SuperAdminGuard)
 */
@Controller('/admin/companies')
@UseBefore(AdminGuard)
export class AdminCompaniesController {
  private readonly companiesService: AdminCompaniesService;

  constructor() {
    this.companiesService = new AdminCompaniesService();
  }

  /**
   * GET /admin/companies
   * Returns paginated list of companies
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Response: CompanyListItemDto[]
   */
  @Get('/')
  async getAllCompanies(
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number
  ): Promise<CompanyListItemDto[]> {
    return this.companiesService.getAllCompanies(limit || 20, offset || 0);
  }

  /**
   * GET /admin/companies/pending
   * Returns pending companies awaiting approval (status_id = 1)
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Response: CompanyListItemDto[]
   */
  @Get('/pending')
  async getPendingCompanies(
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number
  ): Promise<CompanyListItemDto[]> {
    return this.companiesService.getPendingCompanies(limit || 20, offset || 0);
  }

  /**
   * GET /admin/companies/:id
   * Returns company details
   *
   * Response: CompanyDetailDto
   */
  @Get('/:id')
  async getCompanyById(@Param('id') companyId: number): Promise<CompanyDetailDto> {
    return this.companiesService.getCompanyById(companyId);
  }

  /**
   * POST /admin/companies/:id/approve
   * Approves a company (PENDING -> APPROVED)
   * Requires SuperAdminGuard
   *
   * Body: ApproveCompanyRequest
   * - approvalReason: string (why company is approved)
   * - conditions: object (optional, operational conditions)
   *
   * Effects:
   * - Sets status = APPROVED (2)
   * - Logs COMPANY_APPROVED
   * - Notifies relevant parties
   *
   * Response: CompanyDetailDto
   * Error: 400 if company is not PENDING
   */
  @Post('/:id/approve')
  @UseBefore(SuperAdminGuard)
  async approveCompany(
    @Param('id') companyId: number,
    @Body() request: ApproveCompanyRequest,
    @Req() req: Request
  ): Promise<CompanyDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.companiesService.approveCompany(companyId, request, adminId);
  }

  /**
   * POST /admin/companies/:id/reject
   * Rejects a company (PENDING -> REJECTED)
   * Requires SuperAdminGuard
   * REQUIRES rejection reason
   *
   * Body: RejectCompanyRequest
   * - rejectionReason: string (required, why company is rejected)
   *
   * Effects:
   * - Sets status = REJECTED (3)
   * - Logs COMPANY_REJECTED
   * - Notifies company of rejection
   *
   * Response: CompanyDetailDto
   * Error: 400 if company is not PENDING or rejectionReason missing
   */
  @Post('/:id/reject')
  @UseBefore(SuperAdminGuard)
  async rejectCompany(
    @Param('id') companyId: number,
    @Body() request: RejectCompanyRequest,
    @Req() req: Request
  ): Promise<CompanyDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.companiesService.rejectCompany(companyId, request, adminId);
  }

  /**
   * PATCH /admin/companies/:id/conditions
   * Updates company operational conditions
   * Requires SuperAdminGuard
   * Only works for APPROVED companies (status_id = 2)
   *
   * Body: UpdateCompanyConditionsRequest
   * - commissionPct: number (optional, commission percentage)
   * - minManagedAmount: number (optional, minimum managed amount)
   * - metadata: object (optional, additional terms/conditions)
   * - updateReason: string (why conditions are being updated)
   *
   * Effects:
   * - Updates commission percentage and/or minimum amount
   * - Updates metadata with new conditions
   * - Logs COMPANY_CONDITIONS_UPDATED with before/after
   * - Tracks changes for audit trail
   *
   * Response: CompanyDetailDto
   * Error: 400 if company is not APPROVED
   */
  @Patch('/:id/conditions')
  @UseBefore(SuperAdminGuard)
  async updateCompanyConditions(
    @Param('id') companyId: number,
    @Body() request: UpdateCompanyConditionsRequest,
    @Req() req: Request
  ): Promise<CompanyDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.companiesService.updateCompanyConditions(companyId, request, adminId);
  }

  /**
   * POST /admin/companies
   * Creates a new company + linked company user account
   * Requires SuperAdminGuard
   *
   * Body: CreateCompanyRequest
   * Response: CreateCompanyResponse (includes temporaryPassword — shown once)
   */
  @Post('/')
  @UseBefore(SuperAdminGuard)
  async createCompany(@Body() request: CreateCompanyRequest, @Req() req: Request): Promise<CreateCompanyResponse> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.companiesService.createCompany(request, adminId);
  }

  @Put('/:id/suspend')
  @UseBefore(SuperAdminGuard)
  async suspendCompany(@Param('id') companyId: number, @Req() req: Request): Promise<CompanyDetailDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.companiesService.suspendCompany(companyId, adminId);
  }

  @Post('/:id/lenders')
  @UseBefore(SuperAdminGuard)
  async linkLenders(@Param('id') companyId: number, @Body() body: { lenderIds: number[] }, @Req() req: Request): Promise<{ linked: number }> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    return this.companiesService.linkLenders(companyId, body.lenderIds || [], adminId);
  }

  /** Soft suspend company (frontend DELETE calls this). */
  @Delete('/:id')
  @UseBefore(SuperAdminGuard)
  async deleteCompany(@Param('id') companyId: number, @Req() req: Request): Promise<{ success: boolean }> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) throw new Error('Admin user ID not found');
    await this.companiesService.suspendCompany(companyId, adminId);
    return { success: true };
  }
}

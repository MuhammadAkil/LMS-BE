import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseMiddleware, Req } from 'routing-controllers';
import { Request } from 'express';
import { AdminTemplatesService } from '../service/AdminTemplatesService';
import { AdminGuard, SuperAdminGuard, CriticalOperationGuard } from '../middleware/AdminGuards';
import {
  TemplateDto,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  DeprecateTemplateRequest,
} from '../dto/AdminDtos';

/**
 * Admin Templates Controller
 * Endpoints for email/SMS template management
 * Templates are immutable after creation - deprecation pattern enforced
 *
 * Routes:
 * - GET    /admin/templates              -> List active templates (AdminGuard)
 * - GET    /admin/templates/all          -> List all templates including deprecated (AdminGuard)
 * - GET    /admin/templates/:id          -> Get template details (AdminGuard)
 * - GET    /admin/templates/:id/history  -> Get template version history (AdminGuard)
 * - POST   /admin/templates              -> Create new template (SuperAdminGuard)
 * - PATCH  /admin/templates/:id          -> Update template (SuperAdminGuard)
 * - DELETE /admin/templates/:id          -> Delete template (CriticalOperationGuard)
 * - POST   /admin/templates/:id/deprecate -> Deprecate template (SuperAdminGuard)
 * - POST   /admin/templates/:id/restore   -> Restore deprecated template (SuperAdminGuard)
 */
@Controller('/admin/templates')
@UseMiddleware(AdminGuard)
export class AdminTemplatesController {
  private templatesService: AdminTemplatesService;

  constructor() {
    this.templatesService = new AdminTemplatesService();
  }

  /**
   * GET /admin/templates
   * Returns list of active templates (deprecated=false)
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Response: TemplateDto[]
   */
  @Get('/')
  async getAllTemplates(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ): Promise<TemplateDto[]> {
    return this.templatesService.getAllTemplates(limit || 20, offset || 0);
  }

  /**
   * GET /admin/templates/all
   * Returns all templates including deprecated ones
   *
   * Query Parameters:
   * - limit: number (default 20)
   * - offset: number (default 0)
   *
   * Response: TemplateDto[]
   */
  @Get('/all')
  async getAllTemplatesIncludingDeprecated(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ): Promise<TemplateDto[]> {
    return this.templatesService.getAllTemplatesIncludingDeprecated(limit || 20, offset || 0);
  }

  /**
   * GET /admin/templates/:id
   * Returns template details
   *
   * Response: TemplateDto
   */
  @Get('/:id')
  async getTemplateById(@Param('id') templateId: number): Promise<TemplateDto> {
    return this.templatesService.getTemplateById(templateId);
  }

  /**
   * GET /admin/templates/:id/history
   * Returns version history for a template type
   * Shows all versions of templates by type
   *
   * Query Parameters:
   * - limit: number (default 10)
   *
   * Response: TemplateDto[]
   */
  @Get('/:id/history')
  async getTemplateHistory(
    @Param('id') templateId: number,
    @Query('limit') limit?: number
  ): Promise<TemplateDto[]> {
    const template = await this.templatesService.getTemplateById(templateId);
    return this.templatesService.getTemplateHistory(template.type, limit || 10);
  }

  /**
   * POST /admin/templates
   * Creates a new template
   * Requires SuperAdminGuard
   *
   * Body: CreateTemplateRequest
   * - type: string (e.g., PAYMENT_REMINDER, KYC_REQUEST)
   * - language: string (PL, EN, etc.)
   * - subject: string (for email templates)
   * - content: string (template content with {{variables}})
   *
   * Effects:
   * - Creates new template record (immutable)
   * - Logs TEMPLATE_CREATED
   * - Notifies admins of new template
   *
   * Response: TemplateDto
   */
  @Post('/')
  @UseMiddleware(SuperAdminGuard)
  async createTemplate(@Body() request: CreateTemplateRequest, @Req() req: Request): Promise<TemplateDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.templatesService.createTemplate(request, adminId);
  }

  /**
   * PATCH /admin/templates/:id
   * Updates template content or subject
   * Requires SuperAdminGuard
   *
   * Body: UpdateTemplateRequest
   * - subject: string (optional)
   * - content: string (optional)
   *
   * Effects:
   * - Updates template
   * - Logs TEMPLATE_UPDATED with contentChanged flag
   * - Tracks what changed for audit trail
   *
   * Response: TemplateDto
   */
  @Patch('/:id')
  @UseMiddleware(SuperAdminGuard)
  async updateTemplate(
    @Param('id') templateId: number,
    @Body() request: UpdateTemplateRequest,
    @Req() req: Request
  ): Promise<TemplateDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.templatesService.updateTemplate(templateId, request, adminId);
  }

  /**
   * POST /admin/templates/:id/deprecate
   * Marks template as deprecated (soft delete)
   * Requires SuperAdminGuard
   *
   * Body: DeprecateTemplateRequest
   * - reason: string (why is it being deprecated)
   *
   * Effects:
   * - Sets deprecated=true, deprecatedAt=now
   * - Maintains full history
   * - Can be restored with /restore endpoint
   * - Logs TEMPLATE_DEPRECATED
   *
   * Response: TemplateDto
   */
  @Post('/:id/deprecate')
  @UseMiddleware(SuperAdminGuard)
  async deprecateTemplate(
    @Param('id') templateId: number,
    @Body() request: DeprecateTemplateRequest,
    @Req() req: Request
  ): Promise<TemplateDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.templatesService.deprecateTemplate(templateId, request, adminId);
  }

  /**
   * POST /admin/templates/:id/restore
   * Restores a deprecated template
   * Requires SuperAdminGuard
   *
   * Effects:
   * - Sets deprecated=false
   * - Clears deprecatedAt
   * - Makes template active again
   *
   * Response: TemplateDto
   */
  @Post('/:id/restore')
  @UseMiddleware(SuperAdminGuard)
  async restoreTemplate(@Param('id') templateId: number, @Req() req: Request): Promise<TemplateDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.templatesService.restoreTemplate(templateId, adminId);
  }

  /**
   * DELETE /admin/templates/:id
   * Deletes a template permanently
   * CRITICAL OPERATION - Requires SuperAdmin + 2FA
   * Can only delete deprecated templates unless force=true
   *
   * Query Parameters:
   * - force: boolean (optional, default false)
   *
   * Effects:
   * - Hard deletes template record
   * - Logs TEMPLATE_DELETED
   * - Cannot be recovered unless backup exists
   *
   * Response: 204 No Content
   * Error: 400 if template is not deprecated (unless force=true)
   */
  @Delete('/:id')
  @UseMiddleware(CriticalOperationGuard)
  async deleteTemplate(
    @Param('id') templateId: number,
    @Query('force') force?: boolean,
    @Req() req: Request
  ): Promise<void> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    await this.templatesService.deleteTemplate(templateId, adminId, force || false);
  }
}

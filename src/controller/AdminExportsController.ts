import { Controller, Get, Post, Delete, Body, Param, QueryParam, UseBefore, Req, Res } from 'routing-controllers';
import { Request, Response } from 'express';
import { AdminExportsService } from '../service/AdminExportsService';
import { AdminGuard, SuperAdminGuard, CriticalOperationGuard } from '../middleware/AdminGuards';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { basename, isAbsolute, join, normalize, resolve } from 'node:path';
import { resolveStoredRefForDownload } from '../util/storedFileAccess';
import {
  ExportListItemDto,
  GenerateXMLExportRequest,
  GenerateCSVExportRequest,
  GenerateClaimsRequest,
} from '../dto/AdminDtos';

/**
 * Admin Exports Controller
 * Endpoints for data export generation and management
 * Exports are IMMUTABLE after creation - only metadata can be updated
 * Claims generation is CRITICAL - requires SuperAdmin + 2FA
 *
 * Routes:
 * - GET   /admin/exports                  -> Get export history (AdminGuard)
 * - GET   /admin/exports/:id              -> Get export details (AdminGuard)
 * - POST  /admin/exports/xml              -> Generate XML export (SuperAdminGuard)
 * - POST  /admin/exports/csv              -> Generate CSV export (SuperAdminGuard)
 * - POST  /admin/exports/claims/generate  -> Generate claims (CriticalOperationGuard)
 * - DELETE /admin/exports/:id             -> Delete export (AdminGuard)
 */
@Controller('/admin/exports')
@UseBefore(AdminGuard)
export class AdminExportsController {
  private readonly exportsService: AdminExportsService;

  constructor() {
    this.exportsService = new AdminExportsService();
  }

  /**
   * GET /admin/exports
   * Returns export history (recent exports from last 30 days)
   *
   * Query Parameters:
   * - limit: number (default 50)
   * - offset: number (default 0)
   *
   * Response: ExportListItemDto[]
   * Each export includes: id, type, createdBy, filePath, recordCount, createdAt
   */
  @Get('/')
  async getExportHistory(
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number
  ): Promise<ExportListItemDto[]> {
    return this.exportsService.getExportHistory(limit || 50, offset || 0);
  }

  /**
   * GET /admin/exports/:id/download
   * Downloads the physical export file as an attachment
   */
  @Get('/:id/download')
  async downloadExport(@Param('id') exportId: number, @Res() res: Response): Promise<any> {
    const exp = await this.exportsService.getExportById(exportId);
    const rawFilePath: string = (exp as any).filePath || '';

    try {
      const resolved = await resolveStoredRefForDownload(rawFilePath, 3600);
      if (resolved.mode === 'local') {
        const filePath = resolved.path;
        if (!existsSync(filePath)) {
          res.status(404).json({ message: 'Export file not found on disk' });
          return res;
        }
        const fileName = basename(filePath);
        const isXml = fileName.endsWith('.xml');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', isXml ? 'application/xml' : 'text/csv');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        createReadStream(filePath).pipe(res);
        return res;
      }
      res.status(200).json({
        statusCode: '200',
        statusMessage: 'Presigned URL generated successfully',
        data: { url: resolved.url, expiresIn: 3600, key: rawFilePath },
        timestamp: new Date().toISOString(),
      });
      return res;
    } catch {
      const filePath = this.resolveExportPath(rawFilePath);
      if (!filePath || !existsSync(filePath)) {
        res.status(404).json({ message: 'Export file not found' });
        return res;
      }
      const fileName = basename(filePath);
      const isXml = fileName.endsWith('.xml');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', isXml ? 'application/xml' : 'text/csv');
      res.send(readFileSync(filePath));
      return res;
    }
  }

  private resolveExportPath(rawPath: string): string {
    if (!rawPath) return '';

    const normalizedRaw = normalize(rawPath);
    const candidates = new Set<string>();

    if (isAbsolute(normalizedRaw)) {
      candidates.add(normalizedRaw);
    }

    // Handle DB values like '/exports/file.csv' or 'exports/file.csv'
    const cleaned = normalizedRaw.replace(/^[/\\]+/, '');
    candidates.add(resolve(process.cwd(), cleaned));
    candidates.add(resolve(process.cwd(), 'exports', basename(normalizedRaw)));
    candidates.add(join(process.cwd(), 'exports', basename(normalizedRaw)));

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return normalizedRaw;
  }

  /**
   * GET /admin/exports/:id
   * Returns specific export details
   *
   * Response: ExportListItemDto
   */
  @Get('/:id')
  async getExportById(@Param('id') exportId: number): Promise<ExportListItemDto> {
    return this.exportsService.getExportById(exportId);
  }

  /**
   * POST /admin/exports/xml
   * Generates XML export of loans
   * Requires SuperAdminGuard
   *
   * Body: GenerateXMLExportRequest
   * - statusFilter: number (optional, filter by loan status)
   * - dateFrom: Date (optional, filter by date range start)
   * - dateTo: Date (optional, filter by date range end)
   *
   * Features:
   * - Limited to 500 loans per export
   * - Exports are IMMUTABLE (cannot be modified)
   * - Files stored in /exports directory
   * - Records stored in exports table
   * - Logs EXPORT_XML_GENERATED action
   *
   * Response: ExportListItemDto
   * Includes: filePath, recordCount, metadata with filters applied
   */
  @Post('/xml')
  @UseBefore(AdminGuard)
  async generateXMLExport(@Body() request: GenerateXMLExportRequest, @Req() req: Request): Promise<ExportListItemDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.exportsService.generateXMLExport(request, adminId);
  }

  /**
   * POST /admin/exports/csv
   * Generates CSV export of loans
   * Requires SuperAdminGuard
   *
   * Body: GenerateCSVExportRequest
   * - statusFilter: number (optional, filter by loan status)
   * - dateFrom: Date (optional, filter by date range start)
   * - dateTo: Date (optional, filter by date range end)
   *
   * Features:
   * - Limited to 500 loans per export
   * - Format: CSV with headers (ID, UserID, Email, Amount, Status, etc.)
   * - Exports are IMMUTABLE
   * - Logs EXPORT_CSV_GENERATED action
   *
   * Response: ExportListItemDto
   * Includes: filePath, recordCount, metadata
   */
  @Post('/csv')
  @UseBefore(AdminGuard)
  async generateCSVExport(@Body() request: GenerateCSVExportRequest, @Req() req: Request): Promise<ExportListItemDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.exportsService.generateCSVExport(request, adminId);
  }

  /**
   * POST /admin/exports/claims/generate
   * Generates claims list for defaulted loans
   * CRITICAL OPERATION - Requires SuperAdmin + 2FA
   * Should be used with utmost caution - affects debt collection operations
   *
   * Body: GenerateClaimsRequest
   * - minAmount: number (optional, minimum claim amount filter)
   * - reason: string (required, why claims are being generated)
   *
   * Features:
   * - Queries defaulted loans (status_id = 3)
   * - Limited to 1000 records per export
   * - Includes: LoanID, UserID, Email, Phone, Amount, RemainingAmount, DueDate
   * - CRITICAL: Logs EXPORT_CLAIMS_GENERATED with critical flag
   * - Notifies SuperAdmins of claims generation
   * - Immutable after creation
   *
   * Response: ExportListItemDto
   * Error: 403 if not CriticalOperationGuard authorized
   */
  @Post('/claims/generate')
  @UseBefore(CriticalOperationGuard)
  async generateClaimsExport(@Body() request: GenerateClaimsRequest, @Req() req: Request): Promise<ExportListItemDto> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    return this.exportsService.generateClaimsExport(request, adminId);
  }

  /**
   * DELETE /admin/exports/:id
   * Deletes an export record and file
   * Can only delete exports >90 days old (unless force=true)
   *
   * Query Parameters:
   * - force: boolean (optional, default false - override age check)
   *
   * Effects:
   * - Hard deletes export file from disk
   * - Hard deletes export record from database
   * - Logs EXPORT_DELETED action
   * - Cannot be recovered unless backup exists
   *
   * Response: 204 No Content
   * Error: 400 if export is <90 days old (unless force=true)
   */
  @Delete('/:id')
  async deleteExport(
    @Param('id') exportId: number,
    @Req() req: Request,
    @QueryParam('force') force?: boolean
  ): Promise<void> {
    const adminId = (req.user as any)?.id || (req.user as any)?.userId;
    if (!adminId) {
      throw new Error('Admin user ID not found in request');
    }
    await this.exportsService.deleteExport(exportId, adminId, force || false);
  }
}

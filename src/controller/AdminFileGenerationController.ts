import { Request, Response } from 'express';
import { Controller, Get, Post, Put, Req, Res, UseBefore } from 'routing-controllers';
import { FileGenerationService } from '../service/FileGenerationService';
import { existsSync } from 'fs';
import { AdminGuard } from '../middleware/AdminGuards';

/**
 * Admin File Generation Controller
 * GET  /api/admin/file-configs
 * GET  /api/admin/file-configs/approved
 * POST /api/admin/file-configs
 * PUT  /api/admin/file-configs/:id/submit
 * PUT  /api/admin/file-configs/:id/approve
 * PUT  /api/admin/file-configs/:id/reject
 * POST /api/admin/file-generate
 * GET  /api/admin/file-generate/:exportId/download
 */
@Controller('/admin/file-configs')
@UseBefore(AdminGuard)
export class AdminFileConfigController {
  private service: FileGenerationService;

  constructor() {
    this.service = new FileGenerationService();
  }

  @Get('/')
  async getAll(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const data = await this.service.getAllConfigs();
      res.json({ statusCode: '200', statusMessage: 'OK', ...data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Get('/approved')
  async getApproved(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const data = await this.service.getApprovedConfigs();
      res.json({ statusCode: '200', statusMessage: 'OK', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Post('/')
  async create(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const data = await this.service.createConfig(req.body, admin.id);
      res.status(201).json({ statusCode: '201', statusMessage: 'File config created', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id/submit')
  async submit(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      const data = await this.service.submitConfigForApproval(id, admin.id);
      res.json({ statusCode: '200', statusMessage: 'Submitted for approval', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id/approve')
  async approve(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      const data = await this.service.approveConfig(id, admin.id);
      res.json({ statusCode: '200', statusMessage: 'File config approved', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id/reject')
  async reject(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      if (!req.body.comment) {
        res.status(400).json({ statusCode: '400', statusMessage: 'Rejection comment required', timestamp: new Date().toISOString() });
        return;
      }
      const data = await this.service.rejectConfig(id, admin.id, req.body.comment);
      res.json({ statusCode: '200', statusMessage: 'File config rejected', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }
}

@Controller('/admin/file-generate')
@UseBefore(AdminGuard)
export class AdminFileGenerateController {
  private service: FileGenerationService;

  constructor() {
    this.service = new FileGenerationService();
  }

  @Post('/')
  async generate(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const result = await this.service.generateFile(req.body, admin.id);
      res.status(201).json({
        statusCode: '201',
        statusMessage: 'File generated successfully',
        data: {
          exportId: result.exportId,
          recordCount: result.recordCount,
          downloadUrl: `/exports/${result.filePath.split('/').pop()}`,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }
}

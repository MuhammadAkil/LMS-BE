import { Request, Response } from 'express';
import { Controller, Get, Post, Put, Req, Res, UseBefore } from 'routing-controllers';
import { CommissionConfigService } from '../service/CommissionConfigService';
import { ApprovalWorkflowService } from '../service/ApprovalWorkflowService';
import { AdminGuard } from '../middleware/AdminGuards';

/**
 * Admin Commission Config Controller
 * GET  /api/admin/commission-configs
 * GET  /api/admin/commission-configs/pending
 * GET  /api/admin/commission-configs/type/:type
 * POST /api/admin/commission-configs
 * PUT  /api/admin/commission-configs/:id/submit
 * PUT  /api/admin/commission-configs/:id/approve
 * PUT  /api/admin/commission-configs/:id/reject
 *
 * Management Commission:
 * GET  /api/admin/management-commissions
 * GET  /api/admin/management-commissions/pending
 * PUT  /api/admin/management-commissions/:id/approve
 * PUT  /api/admin/management-commissions/:id/reject
 */
@Controller('/admin/commission-configs')
@UseBefore(AdminGuard)
export class AdminCommissionConfigController {
  private service: CommissionConfigService;
  private approvalService: ApprovalWorkflowService;

  constructor() {
    this.service = new CommissionConfigService();
    this.approvalService = new ApprovalWorkflowService();
  }

  @Get('/')
  async getAll(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string ?? '50', 10);
      const offset = parseInt(req.query.offset as string ?? '0', 10);
      const data = await this.service.getAll(limit, offset);
      res.json({ statusCode: '200', statusMessage: 'OK', ...data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Get('/pending')
  async getPending(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const items = await this.approvalService.getAllPendingApprovals();
      res.json({ statusCode: '200', statusMessage: 'OK', data: items, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Get('/type/:type')
  async getByType(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const data = await this.service.getByType(req.params.type);
      res.json({ statusCode: '200', statusMessage: 'OK', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Post('/')
  async create(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const data = await this.service.create(req.body, admin.id);
      res.status(201).json({ statusCode: '201', statusMessage: 'Commission config created', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id/submit')
  async submit(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      const data = await this.service.submitForApproval(id, admin.id);
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
      const data = await this.service.approve(id, admin.id, req.body.comment);
      res.json({ statusCode: '200', statusMessage: 'Commission config approved', data, timestamp: new Date().toISOString() });
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
        res.status(400).json({ statusCode: '400', statusMessage: 'Rejection comment is required', timestamp: new Date().toISOString() });
        return;
      }
      const data = await this.service.reject(id, admin.id, req.body.comment);
      res.json({ statusCode: '200', statusMessage: 'Commission config rejected', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Get('/history/:entityType/:entityId')
  async getApprovalHistory(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const { entityType, entityId } = req.params;
      const data = await this.approvalService.getApprovalHistory(entityType as any, parseInt(entityId, 10));
      res.json({ statusCode: '200', statusMessage: 'OK', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }
}

@Controller('/admin/management-commissions')
@UseBefore(AdminGuard)
export class AdminManagementCommissionController {
  private service: CommissionConfigService;

  constructor() {
    this.service = new CommissionConfigService();
  }

  @Get('/pending')
  async getPending(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const data = await this.service.getPendingManagementCommissions();
      res.json({ statusCode: '200', statusMessage: 'OK', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id/approve')
  async approve(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      const data = await this.service.approveManagementCommission(id, admin.id, req.body.comment);
      res.json({ statusCode: '200', statusMessage: 'Management commission approved', data, timestamp: new Date().toISOString() });
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
        res.status(400).json({ statusCode: '400', statusMessage: 'Rejection comment is required', timestamp: new Date().toISOString() });
        return;
      }
      const data = await this.service.rejectManagementCommission(id, admin.id, req.body.comment);
      res.json({ statusCode: '200', statusMessage: 'Management commission rejected', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }
}

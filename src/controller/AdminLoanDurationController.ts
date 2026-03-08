import { Request, Response } from 'express';
import { Controller, Get, Post, Put, Delete, Req, Res, UseBefore } from 'routing-controllers';
import { LoanDurationConfigService } from '../service/LoanDurationConfigService';
import { AdminGuard, SuperAdminGuard } from '../middleware/AdminGuards';

/**
 * Admin Loan Duration Config Controller
 * GET    /api/admin/loan-durations
 * GET    /api/admin/loan-durations/enabled
 * POST   /api/admin/loan-durations
 * PUT    /api/admin/loan-durations/:id
 * PUT    /api/admin/loan-durations/:id/toggle
 * DELETE /api/admin/loan-durations/:id
 */
@Controller('/admin/loan-durations')
@UseBefore(AdminGuard)
export class AdminLoanDurationController {
  private service: LoanDurationConfigService;

  constructor() {
    this.service = new LoanDurationConfigService();
  }

  @Get('/')
  async getAll(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const data = await this.service.getAll();
      res.json({ statusCode: '200', statusMessage: 'OK', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Get('/enabled')
  async getEnabled(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const data = await this.service.getEnabled();
      res.json({ statusCode: '200', statusMessage: 'OK', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Post('/')
  @UseBefore(SuperAdminGuard)
  async create(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const data = await this.service.create(req.body, admin.id);
      res.status(201).json({ statusCode: '201', statusMessage: 'Duration config created', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id')
  @UseBefore(SuperAdminGuard)
  async update(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      const data = await this.service.update(id, req.body, admin.id);
      res.json({ statusCode: '200', statusMessage: 'Duration config updated', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id/toggle')
  @UseBefore(SuperAdminGuard)
  async toggle(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      const { isEnabled } = req.body;
      if (isEnabled === undefined) {
        res.status(400).json({ statusCode: '400', statusMessage: 'isEnabled is required', timestamp: new Date().toISOString() });
        return;
      }
      const data = await this.service.toggleEnabled(id, Boolean(isEnabled), admin.id);
      res.json({ statusCode: '200', statusMessage: `Duration ${isEnabled ? 'enabled' : 'disabled'}`, data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Delete('/:id')
  @UseBefore(SuperAdminGuard)
  async delete(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      await this.service.delete(id, admin.id);
      res.json({ statusCode: '200', statusMessage: 'Duration config deleted', timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }
}

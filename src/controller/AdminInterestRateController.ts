import { Request, Response } from 'express';
import { Controller, Get, Post, Put, Param, Req, Res, UseBefore } from 'routing-controllers';
import { InterestRateService } from '../service/InterestRateService';
import { AdminGuard, SuperAdminGuard } from '../middleware/AdminGuards';

/**
 * Admin Interest Rate Controller
 * Manages interest rates with effective dates.
 * GET  /api/admin/interest-rates
 * GET  /api/admin/interest-rates/current
 * GET  /api/admin/interest-rates/for-date/:date
 * POST /api/admin/interest-rates
 * PUT  /api/admin/interest-rates/:id
 * PUT  /api/admin/interest-rates/:id/deactivate
 */
@Controller('/admin/interest-rates')
@UseBefore(AdminGuard)
export class AdminInterestRateController {
  private service: InterestRateService;

  constructor() {
    this.service = new InterestRateService();
  }

  @Get('/')
  async getAll(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const rates = await this.service.getAll();
      res.json({ statusCode: '200', statusMessage: 'OK', data: rates, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Get('/current')
  async getCurrent(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const rate = await this.service.getRateForDate();
      res.json({ statusCode: '200', statusMessage: 'OK', data: rate, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Get('/for-date/:date')
  async getRateForDate(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const date = new Date(req.params.date);
      if (isNaN(date.getTime())) {
        res.status(400).json({ statusCode: '400', statusMessage: 'Invalid date format', timestamp: new Date().toISOString() });
        return;
      }
      const rate = await this.service.getRateForDate(date);
      res.json({ statusCode: '200', statusMessage: 'OK', data: rate, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Post('/')
  @UseBefore(SuperAdminGuard)
  async create(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const rate = await this.service.create(req.body, admin.id);
      res.status(201).json({ statusCode: '201', statusMessage: 'Interest rate created', data: rate, timestamp: new Date().toISOString() });
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
      const rate = await this.service.update(id, req.body, admin.id);
      res.json({ statusCode: '200', statusMessage: 'Interest rate updated', data: rate, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id/deactivate')
  @UseBefore(SuperAdminGuard)
  async deactivate(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const admin = (req as any).user;
      const id = parseInt(req.params.id, 10);
      await this.service.deactivate(id, admin.id);
      res.json({ statusCode: '200', statusMessage: 'Interest rate deactivated', timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }
}

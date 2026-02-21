import { Request, Response } from 'express';
import { Controller, Get, Post, Put, Req, Res } from 'routing-controllers';
import { CommissionConfigService } from '../service/CommissionConfigService';

/**
 * Company Management Commission Controller
 * POST /api/company/commissions
 * GET  /api/company/commissions
 * PUT  /api/company/commissions/:id/submit
 */
@Controller('/company/commissions')
export class CompanyCommissionController {
  private service: CommissionConfigService;

  constructor() {
    this.service = new CommissionConfigService();
  }

  @Post('/')
  async create(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const companyId = user.companyId;
      if (!companyId) {
        res.status(403).json({ statusCode: '403', statusMessage: 'No company associated', timestamp: new Date().toISOString() });
        return;
      }

      const data = await this.service.createManagementCommission(
        { ...req.body, companyId },
        user.id
      );
      res.status(201).json({
        statusCode: '201',
        statusMessage: 'Management commission created. Submit for admin approval to activate.',
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Get('/')
  async getMyCommissions(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const companyId = user.companyId;
      if (!companyId) {
        res.status(403).json({ statusCode: '403', statusMessage: 'No company associated', timestamp: new Date().toISOString() });
        return;
      }

      const data = await this.service.getManagementCommissionsByCompany(companyId);
      res.json({ statusCode: '200', statusMessage: 'OK', data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ statusCode: '500', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }

  @Put('/:id/submit')
  async submit(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const id = parseInt(req.params.id, 10);
      const data = await this.service.submitManagementCommissionForApproval(id, user.id);
      res.json({
        statusCode: '200',
        statusMessage: 'Submitted for admin approval. Commission will be active once approved.',
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(400).json({ statusCode: '400', statusMessage: e.message, timestamp: new Date().toISOString() });
    }
  }
}

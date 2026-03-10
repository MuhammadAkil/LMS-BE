import { Request, Response } from 'express';
import { Body, Controller, Get, Post, Req, Res, UseBefore } from 'routing-controllers';
import { CompanyGuard, CompanyReadonlyGuard } from '../middleware/CompanyGuards';
import { BorrowerVerificationService } from '../service/BorrowerVerificationService';
import { UploadVerificationRequest } from '../dto/BorrowerDtos';

@Controller('/company/verification')
@UseBefore(CompanyGuard, CompanyReadonlyGuard)
export class CompanyVerificationController {
  private verificationService: BorrowerVerificationService;

  constructor() {
    this.verificationService = new BorrowerVerificationService();
  }

  @Get('/status')
  async getVerificationStatus(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const response = await this.verificationService.getVerificationStatus(user.id.toString());
      res.status(200).json({
        statusCode: '200',
        statusMessage: 'Verification status retrieved successfully',
        data: response,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        statusCode: '500',
        statusMessage: 'Internal server error',
        errors: [error.message],
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Get('/requirements')
  async getVerificationRequirements(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      const response = await this.verificationService.getVerificationRequirements(user.id.toString());
      res.status(200).json({
        statusCode: '200',
        statusMessage: 'Verification requirements retrieved successfully',
        data: response,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        statusCode: '500',
        statusMessage: 'Internal server error',
        errors: [error.message],
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Post('/upload')
  async uploadVerification(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body?: UploadVerificationRequest
  ): Promise<void> {
    try {
      const user = (req as any).user;
      const request: UploadVerificationRequest = body || req.body;

      const response = await this.verificationService.submitVerification(user.id.toString(), request);
      res.status(201).json({
        statusCode: '201',
        statusMessage: 'Verification submitted successfully',
        data: response,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({
        statusCode: '400',
        statusMessage: 'Verification submission failed',
        errors: [error.message],
        timestamp: new Date().toISOString(),
      });
    }
  }
}

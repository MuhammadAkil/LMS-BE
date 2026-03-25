import { Request, Response } from 'express';
import { Body, Controller, Get, Post, Req, Res, UseBefore } from 'routing-controllers';
import { CompanyGuard, CompanyReadonlyGuard } from '../middleware/CompanyGuards';
import { BorrowerVerificationService } from '../service/BorrowerVerificationService';
import { UploadVerificationRequest } from '../dto/BorrowerDtos';
import { uploadMultiple } from '../middleware/upload.middleware';
import { s3Service } from '../services/s3.service';

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
  @UseBefore(uploadMultiple('documents', 10))
  async uploadVerification(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body?: UploadVerificationRequest
  ): Promise<void> {
    try {
      const user = (req as any).user;
      const files = (((req as any).files || []) as Express.Multer.File[]);
      let request: UploadVerificationRequest = body || req.body;

      if (files.length > 0) {
        const verificationType = req.body?.verificationType || request?.verificationType;
        const uploadedDocuments = await Promise.all(
          files.map(async (file) => {
            const key = s3Service.generateKey('company', String(user.id), file.originalname);
            await s3Service.uploadFile(file.buffer, key, file.mimetype);
            return {
              fileName: file.originalname,
              filePath: key,
            };
          })
        );
        request = {
          verificationType,
          documents: uploadedDocuments,
        };
      }

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

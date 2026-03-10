import { Request, Response } from 'express';
import { BodyParam, Controller, Get, Post, Req, Res, UploadedFiles, UseBefore } from 'routing-controllers';
import { CompanyGuard, CompanyReadonlyGuard } from '../middleware/CompanyGuards';
import { BorrowerVerificationService } from '../service/BorrowerVerificationService';
import { UploadVerificationRequest } from '../dto/BorrowerDtos';
import { kycUploadOptions } from '../util/UploadStorage';

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
    @BodyParam('verificationType') verificationType?: string,
    @BodyParam('documentsMetadata') documentsMetadataRaw?: string,
    @UploadedFiles('documents', { options: kycUploadOptions }) files?: Express.Multer.File[]
  ): Promise<void> {
    try {
      const user = (req as any).user;
      const metadata: Array<Record<string, any>> = (() => {
        if (!documentsMetadataRaw) return [];
        try {
          return JSON.parse(documentsMetadataRaw);
        } catch {
          return [];
        }
      })();

      const request: UploadVerificationRequest = {
        verificationType: verificationType || req.body?.verificationType,
        documents: (files || ((req as any).files as Express.Multer.File[]) || []).map((file, index) => {
          const docMeta = metadata[index] || {};
          return {
            fileName: file.originalname,
            filePath: `/uploads/kyc/${file.filename}`,
            category: docMeta.category,
            subtype: docMeta.subtype,
            side: docMeta.side,
            issuedAt: docMeta.issuedAt,
            expiresAt: docMeta.expiresAt,
            fullName: docMeta.fullName,
            addressLine: docMeta.addressLine,
          };
        }),
      };

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

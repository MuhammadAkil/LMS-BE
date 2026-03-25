import { Controller, Get, Req, Res } from 'routing-controllers';
import { Request, Response } from 'express';
import { s3Service } from '../services/s3.service';
import { S3_BUCKET_NAME } from '../config/s3.config';

@Controller('/s3')
export class S3HealthController {
    @Get('/health')
    async health(@Req() _req: Request, @Res() res: Response): Promise<void> {
        if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
            res.status(404).json({
                status: 'error',
                step: 'guard',
                message: 'S3 health check is disabled in production',
            });
            return;
        }

        const start = Date.now();
        const region = process.env.AWS_REGION || '';
        const key = `health-check/ping-${Date.now()}.txt`;

        try {
            await s3Service.uploadFile(Buffer.from('ping'), key, 'text/plain');
        } catch (error: any) {
            res.status(500).json({
                status: 'error',
                step: 'upload',
                message: error?.message || 'S3 upload failed',
            });
            return;
        }

        let url = '';
        try {
            url = await s3Service.getPresignedUrl(key, 60);
        } catch (error: any) {
            res.status(500).json({
                status: 'error',
                step: 'presign',
                message: error?.message || 'S3 presign failed',
            });
            return;
        }

        try {
            await s3Service.deleteFile(key);
        } catch (error: any) {
            res.status(500).json({
                status: 'error',
                step: 'delete',
                message: error?.message || 'S3 delete failed',
            });
            return;
        }

        res.status(200).json({
            status: 'ok',
            bucket: S3_BUCKET_NAME,
            region,
            uploadOk: true,
            presignOk: Boolean(url),
            deleteOk: true,
            latencyMs: Date.now() - start,
        });
    }
}


import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import config from "../config/Config";
import { s3Client, S3_BUCKET_NAME } from "../config/s3.config";

export class S3Service {
    async uploadFile(file: Buffer, key: string, mimeType: string): Promise<string> {
        if (!S3_BUCKET_NAME) {
            throw new Error("AWS_S3_BUCKET_NAME is not configured");
        }

        await s3Client.send(
            new PutObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: key,
                Body: file,
                ContentType: mimeType,
            })
        );

        return key;
    }

    async getPresignedUrl(
        key: string,
        expiresInSeconds: number = config.s3.presignedUrlExpiry || 3600
    ): Promise<string> {
        if (!S3_BUCKET_NAME) {
            throw new Error("AWS_S3_BUCKET_NAME is not configured");
        }

        const command = new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
        });

        return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    }

    async deleteFile(key: string): Promise<void> {
        if (!S3_BUCKET_NAME) {
            throw new Error("AWS_S3_BUCKET_NAME is not configured");
        }

        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: key,
            })
        );
    }

    generateKey(role: string, entityId: string, fileName: string): string {
        const timestamp = Date.now();
        const sanitizedFileName = fileName
            .toLowerCase()
            .replace(/[^a-z0-9.\-_]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");

        return `${role}/${entityId}/${timestamp}-${sanitizedFileName || "document"}`;
    }
}

export const s3Service = new S3Service();


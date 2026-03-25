import { S3Client } from "@aws-sdk/client-s3";

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION;

if (!accessKeyId || !secretAccessKey || !region) {
    const missing: string[] = [];
    if (!accessKeyId) missing.push("AWS_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("AWS_SECRET_ACCESS_KEY");
    if (!region) missing.push("AWS_REGION");
    throw new Error(`Missing required S3 environment variables: ${missing.join(", ")}`);
}

export const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "";

export const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});


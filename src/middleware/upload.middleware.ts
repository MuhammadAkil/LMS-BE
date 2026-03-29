import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/xml",
    "text/xml",
    "text/csv",
    "application/csv",
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(new Error("Unsupported file type. Allowed: PDF, JPG, PNG, XML, CSV"));
            return;
        }
        cb(null, true);
    },
});

export const uploadSingle = (fieldName: string) => upload.single(fieldName);
export const uploadMultiple = (fieldName: string, maxCount: number) =>
    upload.array(fieldName, maxCount);


import fs from 'fs';
import path from 'path';

// Multer is only used at runtime; keep types simple to satisfy TS without relying on @types/multer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

const ALLOWED_MIME_TYPES = new Set<string>([
    'image/jpeg',
    'image/png',
    'application/pdf',
]);

export function ensureUploadDir(): string {
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'kyc');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
}

export const kycUploadOptions = {
    storage: multer.diskStorage({
        destination: (_req: unknown, _file: { mimetype: string }, cb: (err: Error | null, dest: string) => void) =>
            cb(null, ensureUploadDir()),
        filename: (_req: unknown, file: { originalname: string }, cb: (err: Error | null, name: string) => void) => {
            const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            cb(null, `${Date.now()}_${safeName}`);
        },
    }),
    limits: {
        files: 10,
        fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (_req: unknown, file: { mimetype: string }, cb: (err: Error | null, accept?: boolean) => void) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(new Error('Only JPG, PNG, and PDF files are allowed'), false);
            return;
        }
        cb(null, true);
    },
};

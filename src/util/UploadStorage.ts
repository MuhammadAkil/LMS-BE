import fs from 'fs';
import path from 'path';
import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set([
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

export const kycUploadOptions: multer.Options = {
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ensureUploadDir()),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      cb(null, `${Date.now()}_${safeName}`);
    },
  }),
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, and PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
};

import express from "express";
import request from "supertest";
import { uploadSingle } from "../../../middleware/upload.middleware";

describe("upload.middleware", () => {
    const app = express();

    app.post("/upload", uploadSingle("document"), (req, res) => {
        res.status(200).json({ ok: true, mimeType: (req as any).file?.mimetype });
    });

    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(400).json({ ok: false, message: err?.message || "upload failed" });
    });

    it("accepts allowed mime type", async () => {
        const response = await request(app)
            .post("/upload")
            .attach("document", Buffer.from("pdf-content"), {
                filename: "doc.pdf",
                contentType: "application/pdf",
            });

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
    });

    it("rejects unsupported mime type", async () => {
        const response = await request(app)
            .post("/upload")
            .attach("document", Buffer.from("exe-content"), {
                filename: "malware.exe",
                contentType: "application/x-msdownload",
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Unsupported file type");
    });

    it("rejects files larger than 10MB", async () => {
        const response = await request(app)
            .post("/upload")
            .attach("document", Buffer.alloc(10 * 1024 * 1024 + 1), {
                filename: "big.pdf",
                contentType: "application/pdf",
            });

        expect(response.status).toBe(400);
    });
});
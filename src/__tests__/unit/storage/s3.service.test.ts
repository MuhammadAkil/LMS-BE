import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Service } from "../../../services/s3.service";

const sendMock = jest.fn();
const getSignedUrlMock = jest.fn();

jest.mock("../../../config/s3.config", () => ({
    S3_BUCKET_NAME: "test-bucket",
    s3Client: {
        send: (...args: any[]) => sendMock(...args),
    },
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
    getSignedUrl: (...args: any[]) => getSignedUrlMock(...args),
}));

describe("S3Service", () => {
    beforeEach(() => {
        sendMock.mockReset();
        getSignedUrlMock.mockReset();
    });

    it("uploadFile sends PutObjectCommand and returns key", async () => {
        sendMock.mockResolvedValueOnce({});
        const key = await s3Service.uploadFile(Buffer.from("abc"), "borrower/1/file.pdf", "application/pdf");
        expect(key).toBe("borrower/1/file.pdf");
        expect(sendMock.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    });

    it("getPresignedUrl signs GetObjectCommand", async () => {
        getSignedUrlMock.mockResolvedValueOnce("https://example.com/signed");
        const url = await s3Service.getPresignedUrl("borrower/1/file.pdf", 900);
        expect(url).toBe("https://example.com/signed");
        expect(getSignedUrlMock.mock.calls[0][1]).toBeInstanceOf(GetObjectCommand);
    });

    it("deleteFile sends DeleteObjectCommand", async () => {
        sendMock.mockResolvedValueOnce({});
        await s3Service.deleteFile("borrower/1/file.pdf");
        expect(sendMock.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    });

    it("generateKey sanitizes file name", () => {
        const key = s3Service.generateKey("borrower", "123", "Passport #1 (Final).PDF");
        expect(key.startsWith("borrower/123/")).toBe(true);
        expect(key.endsWith("passport-1-final-.pdf")).toBe(true);
    });
});
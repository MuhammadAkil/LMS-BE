import { AppDataSource } from '../config/database';
import { VerificationDocument } from '../domain/VerificationDocument';

export class VerificationDocumentRepository {
    private verificationDocumentRepository = AppDataSource.getRepository(VerificationDocument);

    async save(document: VerificationDocument): Promise<VerificationDocument> {
        return await this.verificationDocumentRepository.save(document);
    }

    async findById(id: number): Promise<VerificationDocument | null> {
        return await this.verificationDocumentRepository.findOne({
            where: { id },
        });
    }

    async findByVerificationId(verificationId: number): Promise<VerificationDocument[]> {
        return await this.verificationDocumentRepository.find({
            where: { verificationId },
            order: { uploadedAt: 'DESC' },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[VerificationDocument[], number]> {
        return await this.verificationDocumentRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { uploadedAt: 'DESC' },
        });
    }

    async softDelete(id: number): Promise<void> {
        await this.verificationDocumentRepository.update(id, { deletedAt: new Date() });
    }

    async delete(id: number): Promise<void> {
        await this.verificationDocumentRepository.delete(id);
    }
}

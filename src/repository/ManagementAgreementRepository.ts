import { AppDataSource } from '../config/database';
import { ManagementAgreement } from '../domain/ManagementAgreement';

export class ManagementAgreementRepository {
    private managementAgreementRepository = AppDataSource.getRepository(ManagementAgreement);

    async save(agreement: ManagementAgreement): Promise<ManagementAgreement> {
        return await this.managementAgreementRepository.save(agreement);
    }

    async findById(id: number): Promise<ManagementAgreement | null> {
        return await this.managementAgreementRepository.findOne({
            where: { id },
        });
    }

    async findByLenderId(lenderId: number): Promise<ManagementAgreement[]> {
        return await this.managementAgreementRepository.find({
            where: { lenderId },
            order: { signedAt: 'DESC' },
        });
    }

    async findByCompanyId(companyId: number): Promise<ManagementAgreement[]> {
        return await this.managementAgreementRepository.find({
            where: { companyId },
            order: { signedAt: 'DESC' },
        });
    }

    async findByLenderIdAndCompanyId(lenderId: number, companyId: number): Promise<ManagementAgreement | null> {
        return await this.managementAgreementRepository.findOne({
            where: { lenderId, companyId },
        });
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[ManagementAgreement[], number]> {
        return await this.managementAgreementRepository.findAndCount({
            take: limit,
            skip: offset,
            order: { signedAt: 'DESC' },
        });
    }

    async delete(id: number): Promise<void> {
        await this.managementAgreementRepository.delete(id);
    }
}

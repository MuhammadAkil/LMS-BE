import { AppDataSource } from '../config/database';
import { ManagementCommission } from '../domain/ManagementCommission';

export class ManagementCommissionRepository {
  private repo = AppDataSource.getRepository(ManagementCommission);

  async save(mc: Partial<ManagementCommission>): Promise<ManagementCommission> {
    return await this.repo.save(mc as ManagementCommission);
  }

  async findById(id: number): Promise<ManagementCommission | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findByCompanyId(companyId: number): Promise<ManagementCommission[]> {
    return await this.repo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
  }

  async findPending(): Promise<ManagementCommission[]> {
    return await this.repo.find({
      where: { status: 'PENDING_APPROVAL' },
      order: { createdAt: 'ASC' },
    });
  }

  async findApprovedByCompany(companyId: number): Promise<ManagementCommission | null> {
    const results = await this.repo.find({
      where: { companyId, status: 'APPROVED' },
      order: { createdAt: 'DESC' },
    });
    return results[0] ?? null;
  }

  async update(id: number, data: Partial<ManagementCommission>): Promise<void> {
    await this.repo.update(id, data);
  }

  async findAll(limit = 50, offset = 0): Promise<[ManagementCommission[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }
}

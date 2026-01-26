import { AppDataSource } from '../config/database';
import { Company } from '../domain/Company';

export class CompanyRepository {
  private repo = AppDataSource.getRepository(Company);

  async save(company: Company): Promise<Company> {
    return await this.repo.save(company);
  }

  async findById(id: number): Promise<Company | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findByName(name: string): Promise<Company | null> {
    return await this.repo.findOne({ where: { name } });
  }

  async findByStatus(statusId: number, limit: number = 20, offset: number = 0): Promise<[Company[], number]> {
    return await this.repo.findAndCount({
      where: { statusId },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(limit: number = 20, offset: number = 0): Promise<[Company[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findActive(limit: number = 20, offset: number = 0): Promise<[Company[], number]> {
    // statusId = 2 for ACTIVE
    return await this.repo.findAndCount({
      where: { statusId: 2 },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findPending(limit: number = 20, offset: number = 0): Promise<[Company[], number]> {
    // statusId = 1 for PENDING
    return await this.repo.findAndCount({
      where: { statusId: 1 },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: number, data: Partial<Company>): Promise<Company | null> {
    await this.repo.update(id, data);
    return await this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.repo.count({ where: { name } });
    return count > 0;
  }

  async countByStatus(statusId: number): Promise<number> {
    return await this.repo.count({ where: { statusId } });
  }
}

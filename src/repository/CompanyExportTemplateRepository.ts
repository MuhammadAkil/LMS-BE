import { AppDataSource } from '../config/database';
import { CompanyExportTemplate } from '../domain/CompanyExportTemplate';

export class CompanyExportTemplateRepository {
  private repo = AppDataSource.getRepository(CompanyExportTemplate);

  async save(t: CompanyExportTemplate): Promise<CompanyExportTemplate> {
    return this.repo.save(t);
  }

  async findById(id: number): Promise<CompanyExportTemplate | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByCompanyId(companyId: number): Promise<CompanyExportTemplate[]> {
    return this.repo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByCompanyAndId(companyId: number, id: number): Promise<CompanyExportTemplate | null> {
    return this.repo.findOne({ where: { companyId, id } });
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}

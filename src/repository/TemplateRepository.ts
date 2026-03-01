import { AppDataSource } from '../config/database';
import { Template } from '../domain/Template';

export class TemplateRepository {
  private repo = AppDataSource.getRepository(Template);

  async save(template: Template): Promise<Template> {
    return await this.repo.save(template);
  }

  async findById(id: number): Promise<Template | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findByTypeAndLanguage(type: string, language: string): Promise<Template | null> {
    return await this.repo.findOne({
      where: { type, language, deprecated: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findByType(type: string, limit: number = 20, offset: number = 0): Promise<[Template[], number]> {
    return await this.repo.findAndCount({
      where: { type },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<[Template[], number]> {
    return await this.repo.findAndCount({
      where: { deprecated: false },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findAllIncludingDeprecated(limit: number = 50, offset: number = 0): Promise<[Template[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findByLanguage(language: string, limit: number = 50, offset: number = 0): Promise<[Template[], number]> {
    return await this.repo.findAndCount({
      where: { language, deprecated: false },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: number, data: Partial<Template>): Promise<Template | null> {
    await this.repo.update(id, data);
    return await this.findById(id);
  }

  async deprecate(id: number): Promise<Template | null> {
    await this.repo.update(id, {
      deprecated: true,
      deprecatedAt: new Date(),
    });
    return await this.findById(id);
  }

  async restore(id: number): Promise<Template | null> {
    await this.repo.update(id, {
      deprecated: false,
      deprecatedAt: null,
    });
    return await this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async findHistoryByType(type: string, limit: number = 20): Promise<Template[]> {
    return await this.repo.find({
      where: { type },
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }
}

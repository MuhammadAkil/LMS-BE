import { AppDataSource } from '../config/database';
import { Export } from '../domain/Export';

export class ExportRepository {
  private repo = AppDataSource.getRepository(Export);

  async save(exp: Export): Promise<Export> {
    return await this.repo.save(exp);
  }

  async findById(id: number): Promise<Export | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findByCreatedBy(createdBy: number, limit: number = 20, offset: number = 0): Promise<[Export[], number]> {
    return await this.repo.findAndCount({
      where: { createdBy },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findByType(typeId: number, limit: number = 50, offset: number = 0): Promise<[Export[], number]> {
    return await this.repo.findAndCount({
      where: { typeId },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<[Export[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findRecent(days: number = 30, limit: number = 50): Promise<Export[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return await this.repo.find({
      where: { createdAt: new Date(since) },
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async countByType(typeId: number): Promise<number> {
    return await this.repo.count({ where: { typeId } });
  }

  async countByCreatedBy(createdBy: number): Promise<number> {
    return await this.repo.count({ where: { createdBy } });
  }

  /**
   * Exports are immutable - cannot be updated after creation
   * Only metadata can be added for context
   */
  async addMetadata(id: number, metadata: Record<string, any>): Promise<Export | null> {
    const exp = await this.findById(id);
    if (!exp) return null;

    const currentMeta = exp.metadata ? JSON.parse(exp.metadata) : {};
    const updated = { ...currentMeta, ...metadata };

    await this.repo.update(id, {
      metadata: JSON.stringify(updated),
    });

    return await this.findById(id);
  }

  /**
   * Mark export as processed (soft delete pattern)
   */
  async markAsProcessed(id: number): Promise<Export | null> {
    await this.addMetadata(id, { processedAt: new Date().toISOString() });
    return await this.findById(id);
  }

  /**
   * Hard delete only in emergency
   */
  async hardDelete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}

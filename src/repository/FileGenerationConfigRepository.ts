import { AppDataSource } from '../config/database';
import { FileGenerationConfig } from '../domain/FileGenerationConfig';

export class FileGenerationConfigRepository {
  private repo = AppDataSource.getRepository(FileGenerationConfig);

  async save(config: Partial<FileGenerationConfig>): Promise<FileGenerationConfig> {
    return await this.repo.save(config as FileGenerationConfig);
  }

  async findById(id: number): Promise<FileGenerationConfig | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findAll(limit = 50, offset = 0): Promise<[FileGenerationConfig[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findApproved(): Promise<FileGenerationConfig[]> {
    return await this.repo.find({
      where: { status: 'APPROVED' },
      order: { createdAt: 'DESC' },
    });
  }

  async findPending(): Promise<FileGenerationConfig[]> {
    return await this.repo.find({
      where: { status: 'PENDING_APPROVAL' },
      order: { createdAt: 'ASC' },
    });
  }

  async update(id: number, data: Partial<FileGenerationConfig>): Promise<void> {
    await this.repo.update(id, data);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}

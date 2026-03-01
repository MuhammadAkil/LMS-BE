import { AppDataSource } from '../config/database';
import { PlatformConfig } from '../domain/PlatformConfig';

export class PlatformConfigRepository {
  private repo = AppDataSource.getRepository(PlatformConfig);

  async save(config: PlatformConfig): Promise<PlatformConfig> {
    return await this.repo.save(config);
  }

  async findById(id: number): Promise<PlatformConfig | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findByKey(key: string): Promise<PlatformConfig | null> {
    return await this.repo.findOne({ where: { key } });
  }

  async findAll(limit: number = 100, offset: number = 0): Promise<[PlatformConfig[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findByKeyPattern(pattern: string, limit: number = 50): Promise<PlatformConfig[]> {
    return await this.repo
      .createQueryBuilder('config')
      .where('config.key LIKE :pattern', { pattern: `%${pattern}%` })
      .orderBy('config.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }

  async update(id: number, data: Partial<PlatformConfig>): Promise<PlatformConfig | null> {
    // Increment version on update
    const config = await this.findById(id);
    if (!config) return null;

    await this.repo.update(id, {
      ...data,
      version: config.version + 1,
    });

    return await this.findById(id);
  }

  async updateByKey(key: string, value: string, description?: string): Promise<PlatformConfig | null> {
    let config = await this.findByKey(key);

    if (!config) {
      config = new PlatformConfig();
      config.key = key;
      config.value = value;
      config.description = description;
      return await this.save(config);
    }

    await this.repo.update(config.id, {
      value,
      description,
      version: config.version + 1,
    });

    return await this.findById(config.id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  /**
   * Get configuration value as parsed JSON
   */
  async getConfigValue<T = any>(key: string, defaultValue?: T): Promise<T | null> {
    const config = await this.findByKey(key);
    if (!config) return defaultValue ?? null;

    try {
      return JSON.parse(config.value) as T;
    } catch {
      return config.value as any;
    }
  }

  /**
   * Get multiple config values at once
   */
  async getMultipleValues(keys: string[]): Promise<Record<string, any>> {
    const configs = await this.repo.find({
      where: keys.map(key => ({ key })),
    });

    const result: Record<string, any> = {};
    configs.forEach(config => {
      try {
        result[config.key] = JSON.parse(config.value);
      } catch {
        result[config.key] = config.value;
      }
    });

    return result;
  }

  /**
   * Get version history for a config key
   */
  async getVersionHistory(key: string, limit: number = 10): Promise<PlatformConfig[]> {
    return await this.repo.find({
      where: { key },
      order: { version: 'DESC' },
      take: limit,
    });
  }
}

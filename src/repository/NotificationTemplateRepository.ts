import { AppDataSource } from '../config/database';
import { NotificationTemplate } from '../domain/NotificationTemplate';

export class NotificationTemplateRepository {
  private repo = AppDataSource.getRepository(NotificationTemplate);

  async findByCodeAndLocale(code: string, locale: string): Promise<NotificationTemplate | null> {
    return this.repo.findOne({
      where: { code, locale, isActive: true },
    });
  }

  async findAll(limit: number = 100, offset: number = 0): Promise<[NotificationTemplate[], number]> {
    return this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { code: 'ASC', locale: 'ASC' },
    });
  }

  async save(template: NotificationTemplate): Promise<NotificationTemplate> {
    return this.repo.save(template);
  }
}

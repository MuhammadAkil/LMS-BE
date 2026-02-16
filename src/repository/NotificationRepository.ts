import { AppDataSource } from '../config/database';
import { Notification } from '../domain/Notification';
import { Between, In } from 'typeorm';

export class NotificationRepository {
  private repo = AppDataSource.getRepository(Notification);

  async create(notification: Notification): Promise<Notification> {
    return await this.repo.save(notification);
  }

  async findById(id: number): Promise<Notification | null> {
    return await this.repo.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findByUserId(userId: number, limit: number = 20, offset: number = 0): Promise<[Notification[], number]> {
    return await this.repo.findAndCount({
      where: { userId },
      relations: ['user'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findUnreadByUserId(userId: number, limit: number = 20): Promise<Notification[]> {
    return await this.repo.find({
      where: { userId, read: false },
      relations: ['user'],
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async markAsRead(id: number): Promise<Notification | null> {
    await this.repo.update(id, {
      read: true,
      readAt: new Date(),
    });
    return await this.findById(id);
  }

  async markMultipleAsRead(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.repo.update({ id: In(ids) }, {
      read: true,
      readAt: new Date(),
    });
  }

  async findByType(type: string, limit: number = 50, offset: number = 0): Promise<[Notification[], number]> {
    return await this.repo.findAndCount({
      where: { type },
      relations: ['user'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 50,
    offset: number = 0
  ): Promise<[Notification[], number]> {
    return await this.repo.findAndCount({
      where: { createdAt: Between(startDate, endDate) },
      relations: ['user'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async countUnreadByUserId(userId: number): Promise<number> {
    return await this.repo.count({
      where: { userId, read: false },
    });
  }
}

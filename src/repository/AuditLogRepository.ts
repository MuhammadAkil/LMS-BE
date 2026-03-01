import { AppDataSource } from '../config/database';
import { AuditLog } from '../domain/AuditLog';
import { Between, IsNull, Not } from 'typeorm';

export class AuditLogRepository {
  private repo = AppDataSource.getRepository(AuditLog);

  async create(auditLog: Partial<AuditLog> & { actorId?: number }): Promise<AuditLog> {
    const { actorId, createdAt, ...rest } = auditLog as any;
    const entity = this.repo.create({
      ...rest,
      // Support both actorId (legacy callers) and userId
      userId: rest.userId ?? actorId,
    });
    return await this.repo.save(entity) as unknown as AuditLog;
  }

  async findById(id: number): Promise<AuditLog | null> {
    return await this.repo.findOne({
      where: { id },
      relations: ['actor'],
    });
  }

  async findByEntity(entity: string, entityId: number): Promise<AuditLog[]> {
    return await this.repo.find({
      where: { entity, entityId },
      relations: ['actor'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByActor(actorId: number, limit: number = 50, offset: number = 0): Promise<[AuditLog[], number]> {
    return await this.repo.findAndCount({
      where: { userId: actorId },  // Changed from actorId to userId
      relations: ['actor'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findByAction(action: string, limit: number = 50, offset: number = 0): Promise<[AuditLog[], number]> {
    return await this.repo.findAndCount({
      where: { action },
      relations: ['actor'],
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
  ): Promise<[AuditLog[], number]> {
    return await this.repo.findAndCount({
      where: { createdAt: Between(startDate, endDate) },
      relations: ['actor'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<[AuditLog[], number]> {
    return await this.repo.findAndCount({
      relations: ['actor'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findByEntityType(entity: string, limit: number = 50, offset: number = 0): Promise<[AuditLog[], number]> {
    return await this.repo.findAndCount({
      where: { entity },
      relations: ['actor'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  async findByActionAndEntity(
    action: string,
    entity: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<[AuditLog[], number]> {
    return await this.repo.findAndCount({
      where: { action, entity },
      relations: ['actor'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Soft delete - updates metadata to mark as deleted
   * Hard deletes are prohibited for audit compliance
   */
  async markAsDeleted(id: number): Promise<void> {
    await this.repo.update(id, {
      metadata: JSON.stringify({ deletedAt: new Date().toISOString() }),
    });
  }

  /**
   * Hard delete only in emergency scenarios
   * Should trigger additional notification
   */
  async hardDelete(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}

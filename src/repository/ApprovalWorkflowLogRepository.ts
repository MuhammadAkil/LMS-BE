import { AppDataSource } from '../config/database';
import { ApprovalWorkflowLog } from '../domain/ApprovalWorkflowLog';

export class ApprovalWorkflowLogRepository {
  private repo = AppDataSource.getRepository(ApprovalWorkflowLog);

  async create(log: Partial<ApprovalWorkflowLog>): Promise<ApprovalWorkflowLog> {
    return await this.repo.save(log as ApprovalWorkflowLog);
  }

  async findByEntity(entityType: string, entityId: number): Promise<ApprovalWorkflowLog[]> {
    return await this.repo.find({
      where: { entityType, entityId },
      order: { createdAt: 'ASC' },
    });
  }

  async findAll(limit = 100, offset = 0): Promise<[ApprovalWorkflowLog[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }
}

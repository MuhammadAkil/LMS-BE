import { AppDataSource } from '../config/database';
import { Verification } from '../domain/Verification';
import { In } from 'typeorm';

export class VerificationRepository {
  private repo = AppDataSource.getRepository(Verification);

  async save(verification: Verification): Promise<Verification> {
    return await this.repo.save(verification);
  }

  async findById(id: number): Promise<Verification | null> {
    return await this.repo.findOne({ where: { id } });
  }

  async findByUserId(userId: number, limit: number = 20, offset: number = 0): Promise<[Verification[], number]> {
    return await this.repo.findAndCount({
      where: { userId },
      take: limit,
      skip: offset,
      order: { submittedAt: 'DESC' },
    });
  }

  async findByStatus(statusId: number, limit: number = 20, offset: number = 0): Promise<[Verification[], number]> {
    return await this.repo.findAndCount({
      where: { statusId },
      take: limit,
      skip: offset,
      order: { submittedAt: 'DESC' },
    });
  }

  async findByType(typeId: number, limit: number = 20, offset: number = 0): Promise<[Verification[], number]> {
    return await this.repo.findAndCount({
      where: { typeId },
      take: limit,
      skip: offset,
      order: { submittedAt: 'DESC' },
    });
  }

  async findPending(limit: number = 50, offset: number = 0): Promise<[Verification[], number]> {
    // statusId = 1 for PENDING_VERIFICATION
    return await this.repo.findAndCount({
      where: { statusId: 1 },
      take: limit,
      skip: offset,
      order: { submittedAt: 'ASC' },
    });
  }

  async findReviewQueue(limit: number = 50, offset: number = 0): Promise<[Verification[], number]> {
    return await this.repo.findAndCount({
      where: { statusId: In([1, 2]) }, // PENDING_VERIFICATION + UNDER_REVIEW
      take: limit,
      skip: offset,
      order: { submittedAt: 'ASC' },
    });
  }

  async findByUserAndType(userId: number, typeId: number): Promise<Verification | null> {
    return await this.repo.findOne({
      where: { userId, typeId },
      order: { submittedAt: 'DESC' },
    });
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<[Verification[], number]> {
    return await this.repo.findAndCount({
      take: limit,
      skip: offset,
      order: { submittedAt: 'DESC' },
    });
  }

  async findByStatusIds(statusIds: number[], limit: number = 50, offset: number = 0): Promise<[Verification[], number]> {
    return await this.repo.findAndCount({
      where: { statusId: In(statusIds) },
      take: limit,
      skip: offset,
      order: { submittedAt: 'DESC' },
    });
  }

  async update(id: number, data: Partial<Verification>): Promise<Verification | null> {
    await this.repo.update(id, data);
    return await this.findById(id);
  }

  async countByStatus(statusId: number): Promise<number> {
    return await this.repo.count({ where: { statusId } });
  }

  async countPending(): Promise<number> {
    return await this.countByStatus(1); // PENDING_VERIFICATION status
  }
}

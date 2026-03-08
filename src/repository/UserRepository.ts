import { AppDataSource } from '../config/database';
import { User } from '../domain/User';
import { In, IsNull } from 'typeorm';

export class UserRepository {
    private userRepository = AppDataSource.getRepository(User);

    async save(user: User): Promise<User> {
        return await this.userRepository.save(user);
    }

    async findById(id: number): Promise<User | null> {
        return await this.userRepository.findOne({
            where: { id },
            relations: ['role', 'status'],
        });
    }

    async findByEmail(email: string): Promise<User | null> {
        return await this.userRepository.findOne({
            where: { email },
            relations: ['role', 'status'],
        });
    }

    async findByIdWithRelations(id: number): Promise<User | null> {
        return await this.userRepository.findOne({
            where: { id },
            relations: ['role', 'status'],
        });
    }

    async exists(id: number): Promise<boolean> {
        const count = await this.userRepository.count({ where: { id } });
        return count > 0;
    }

    async existsByEmail(email: string): Promise<boolean> {
        const count = await this.userRepository.count({ where: { email } });
        return count > 0;
    }

    async findAll(limit: number = 10, offset: number = 0): Promise<[User[], number]> {
        return await this.userRepository.findAndCount({
            where: { deletedAt: IsNull() },
            take: limit,
            skip: offset,
            relations: ['role', 'status'],
            order: { createdAt: 'DESC' },
        });
    }

    async softDelete(id: number): Promise<boolean> {
        const result = await this.userRepository.update(id, { deletedAt: new Date() } as Partial<User>);
        return (result.affected ?? 0) > 0;
    }

    async findByStatus(statusId: number, limit: number = 10, offset: number = 0): Promise<[User[], number]> {
        return await this.userRepository.findAndCount({
            where: { statusId },
            take: limit,
            skip: offset,
            relations: ['role', 'status'],
            order: { createdAt: 'DESC' },
        });
    }

    async findByRole(roleId: number, limit: number = 10, offset: number = 0): Promise<[User[], number]> {
        return await this.userRepository.findAndCount({
            where: { roleId },
            take: limit,
            skip: offset,
            relations: ['role', 'status'],
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: number, user: Partial<User>): Promise<User | null> {
        await this.userRepository.update(id, user);
        return await this.findById(id);
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.userRepository.delete(id);
        return (result.affected ?? 0) > 0;
    }

    async findByIds(ids: number[]): Promise<User[]> {
        if (ids.length === 0) return [];
        return await this.userRepository.find({
            where: { id: In(ids) },
            relations: ['role', 'status'],
        });
    }

    async findByCompanyId(companyId: number): Promise<User[]> {
        return await this.userRepository.find({
            where: { companyId, deletedAt: IsNull() },
            relations: ['role', 'status'],
        });
    }
}

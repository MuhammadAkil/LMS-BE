import { AppDataSource } from '../config/database';
import { UserSession } from '../domain/UserSession';

export class UserSessionRepository {
    private sessionRepository = AppDataSource.getRepository(UserSession);

    async save(session: UserSession): Promise<UserSession> {
        return await this.sessionRepository.save(session);
    }

    async findById(id: number): Promise<UserSession | null> {
        return await this.sessionRepository.findOne({
            where: { id },
            relations: ['user'],
        });
    }

    async findByToken(token: string): Promise<UserSession | null> {
        return await this.sessionRepository.findOne({
            where: { token },
            relations: ['user'],
        });
    }

    async findByUserId(userId: number): Promise<UserSession | null> {
        return await this.sessionRepository.findOne({
            where: { userId },
            relations: ['user'],
        });
    }

    /** Find the latest session for a user (most recent by created_at). */
    async findLatestByUserId(userId: number): Promise<UserSession | null> {
        return await this.sessionRepository.findOne({
            where: { userId },
            order: { createdAt: 'DESC' },
            relations: ['user'],
        });
    }

    /** Set the latest session's expires_at to now (expire it). Returns true if a session was updated. */
    async expireLatestSessionByUserId(userId: number): Promise<boolean> {
        const session = await this.findLatestByUserId(userId);
        if (!session) return false;
        session.expiresAt = new Date();
        await this.sessionRepository.save(session);
        return true;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.sessionRepository.delete(id);
        return (result.affected ?? 0) > 0;
    }

    async deleteByUserId(userId: number): Promise<boolean> {
        const result = await this.sessionRepository.delete({ userId });
        return (result.affected ?? 0) > 0;
    }

    async deleteByToken(token: string): Promise<boolean> {
        const result = await this.sessionRepository.delete({ token });
        return (result.affected ?? 0) > 0;
    }

    async isTokenValid(token: string): Promise<boolean> {
        const session = await this.findByToken(token);
        if (!session) return false;

        if (session.expiresAt && new Date() > session.expiresAt) {
            await this.delete(session.id);
            return false;
        }

        return true;
    }
}

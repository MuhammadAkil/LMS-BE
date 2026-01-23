import { ObjectId, MongoRepository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { CustomerAuthSession } from '../domain/CustomerAuthSession';

export class CustomerAuthSessionRepository {
  private repository: MongoRepository<CustomerAuthSession>;

  constructor() {
    this.repository = AppDataSource.getMongoRepository(CustomerAuthSession);
  }

  /**
   * Find a session by its JWT token.
   * @param jwtToken - The JWT token string.
   * @returns The CustomerAuthSession if found, otherwise null.
   */
  async findByJwtToken(jwtToken: string): Promise<CustomerAuthSession | null> {
    return await this.repository.findOne({
      where: { jwtToken },
    });
  }

  /**
   * Find a session by the customer's ObjectId.
   * @param customerId - The customer's ObjectId or string representation.
   * @returns The CustomerAuthSession if found, otherwise null.
   */
  async findByCustomerId(customerId: string | ObjectId): Promise<CustomerAuthSession | null> {
    const customerObjectId =
        typeof customerId === 'string' ? new ObjectId(customerId) : customerId;

    return await this.repository.findOne({
      where: { customerId: customerObjectId },
    });
  }

  /**
   * Save or update a CustomerAuthSession document.
   * @param session - The session to save.
   * @returns The saved CustomerAuthSession.
   */
  async save(session: CustomerAuthSession): Promise<CustomerAuthSession> {
    return await this.repository.save(session);
  }

  /**
   * Delete a CustomerAuthSession document.
   * @param session - The session to delete.
   */
  async delete(session: CustomerAuthSession): Promise<void> {
    await this.repository.remove(session);
  }

  /**
   * Delete all expired sessions before the given date.
   * @param currentDate - The cutoff date for expired sessions.
   */
  async deleteExpiredSessions(currentDate: Date): Promise<void> {
    await this.repository.deleteMany({
      expiresAt: { $lt: currentDate },
    });
  }
}

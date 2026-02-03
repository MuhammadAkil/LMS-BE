import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Customer } from '../domain/Customer';

export class CustomerRepository {
  private repository: Repository<Customer>;

  constructor() {
    this.repository = AppDataSource.getRepository(Customer);
  }

  /**
   * Find a customer by their mobile number.
   * @param mobileNumber - The mobile number of the customer.
   * @returns The customer object if found, otherwise null.
   */
  async findByMobileNumber(mobileNumber: string) {
    return await this.repository.findOne({
      where: { mobileNumber },
    });
  }

  /**
   * Find a customer by their email address.
   * @param email - The email of the customer.
   * @returns The customer object if found, otherwise null.
   */
  async findByEmail(email: string): Promise<Customer | null> {
    return await this.repository.findOne({
      where: { email },
    });
  }

  /**
   * Find a customer by their CNIC.
   * @param cnic - The CNIC of the customer.
   * @returns The customer object if found, otherwise null.
   */
  async findByCnic(cnic: string): Promise<Customer | null> {
    return await this.repository.findOne({
      where: { cnic },
    });
  }

  /**
   * Check if a customer exists with a given mobile number.
   * @param mobileNumber - The mobile number to check.
   * @returns True if a customer exists, otherwise false.
   */
  async existsByMobileNumber(mobileNumber: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { mobileNumber },
    });
    return count > 0;
  }

  /**
   * Check if a customer exists with a given CNIC.
   * @param cnic - The CNIC to check.
   * @returns True if a customer exists, otherwise false.
   */
  async existsByCnic(cnic: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { cnic },
    });
    return count > 0;
  }

  /**
   * Save a customer document.
   * If the customer already exists, it will be updated.
   * @param customer - The customer object to save.
   * @returns The saved customer object.
   */
  async save(customer: Customer): Promise<Customer> {
    return await this.repository.save(customer);
  }

  /**
   * Find a customer by their ID.
   * @param id - The customer ID.
   * @returns The customer object if found, otherwise null.
   */
  async findOne(id: string): Promise<Customer | null> {
    return await this.repository.findOne({ where: { id } });
  }
}

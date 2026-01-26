import * as bcrypt from 'bcrypt';
import { CustomerRepository } from '../repository/CustomerRepository';
import { CustomerAuthSessionRepository } from '../repository/CustomerAuthSessionRepository';
import { Customer } from '../domain/Customer';
import { CustomerAuthSession } from '../domain/CustomerAuthSession';
import { LoginRequest } from '../dto/LoginRequest';
import { SignupRequest } from '../dto/SignupRequest';
import { LogoutRequest } from '../dto/LogoutRequest';
import { LoginResponse } from '../dto/LoginResponse';
import { ModuleResponse } from '../dto/ModuleResponse';
import { StateMessages } from '../util/StateMessages';
import { JwtTokenUtil } from '../util/JwtTokenUtil';

export class CustomerService {
  private readonly customerRepository: CustomerRepository;
  private readonly customerAuthSessionRepository: CustomerAuthSessionRepository;
  private readonly DEFAULT_CUSTOMER_STATUS = 'ACTIVE'; // Mongo-friendly

  constructor() {
    this.customerRepository = new CustomerRepository();
    this.customerAuthSessionRepository = new CustomerAuthSessionRepository();
  }

  async signup(signupRequest: SignupRequest): Promise<ModuleResponse> {
    const existing = await this.customerRepository.findByEmail(signupRequest.email);
    if (existing) {
      return ModuleResponse.generateCustomResponse(400, 'Email is already registered');
    }

    try {
      return await this.createCustomer(signupRequest);
    } catch (error: any) {
      console.log('Error during customer signup:', error);
      return ModuleResponse.generateServerErrorResponse('Failed to create customer account');
    }
  }

  private async createCustomer(signupRequest: SignupRequest): Promise<ModuleResponse> {
    const customer = new Customer();
    customer.email = signupRequest.email;
    customer.password = await bcrypt.hash(signupRequest.password, 10);
    customer.fullName = signupRequest.fullName;
    customer.status = this.DEFAULT_CUSTOMER_STATUS; // string
    const now = new Date();
    customer.createdAt = now;
    customer.updatedAt = now;

    const savedCustomer = await this.customerRepository.save(customer);

    console.log('Customer signed up successfully with email: {}', signupRequest.email);

    return ModuleResponse.generateCreateResponse(savedCustomer.id.toHexString());
  }

  async getCustomerByMobileNumber(mobileNumber: string): Promise<Customer | null> {
    return await this.customerRepository.findByEmail(mobileNumber);
  }

  async login(loginRequest: LoginRequest): Promise<ModuleResponse> {
    const customer = await this.customerRepository.findByEmail(loginRequest.email);

    if (!customer) {
      console.log('Login attempt with non-existent email: {}', loginRequest.email);
      return ModuleResponse.generateCustomResponse(401, StateMessages.INVALID_CREDENTIALS);
    }

    const isPasswordValid = await bcrypt.compare(loginRequest.password, customer.password);
    if (!isPasswordValid) {
      console.log('Invalid password attempt for customer: {}', customer.id.toHexString());
      return ModuleResponse.generateCustomResponse(401, StateMessages.INVALID_CREDENTIALS);
    }

    if (customer.status !== this.DEFAULT_CUSTOMER_STATUS) {
      console.log('Login attempt for inactive customer: {}', customer.id.toHexString());
      return ModuleResponse.generateCustomResponse(403, 'Customer account is not active');
    }

    const existingSession = await this.customerAuthSessionRepository.findByCustomerId(customer.id);
    if (existingSession) {
      await this.customerAuthSessionRepository.delete(existingSession);
      console.log('Deleted existing session for customer: {}', customer.id.toHexString());
    }

    const jwtToken = JwtTokenUtil.generateToken(customer.id as any, customer.email, 1); // roleId=1 for customer
    const expiresAt = JwtTokenUtil.getTokenExpirationDate();

    const session = new CustomerAuthSession();
    session.customerId = customer.id.toHexString();
    session.jwtToken = jwtToken;
    session.expiresAt = expiresAt;
    session.createdAt = new Date();
    session.updatedAt = new Date();

    await this.customerAuthSessionRepository.save(session);

    const loginResponse: LoginResponse = {
      token: jwtToken,
      userId: customer.id as any,
      email: customer.email,
      roleId: 1,
      expiresAt,
    };

    console.log('Customer logged in successfully: {}', customer.id.toHexString());

    return ModuleResponse.generateSuccessResponse(loginResponse);
  }

  async logout(logoutRequest: LogoutRequest): Promise<ModuleResponse> {
    // LogoutRequest doesn't have properties - token should be extracted from request header
    // This is a placeholder implementation - the actual request would have userId from JWT
    console.log('Customer logout request processed');

    return ModuleResponse.generateSuccessResponse();
  }
}

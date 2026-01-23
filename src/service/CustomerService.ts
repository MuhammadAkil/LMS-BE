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
import { CustomUserDetails } from '../security/CustomUserDetails';

export class CustomerService {
  private customerRepository: CustomerRepository;
  private customerAuthSessionRepository: CustomerAuthSessionRepository;
  private readonly DEFAULT_CUSTOMER_STATUS = 'ACTIVE'; // Mongo-friendly

  constructor() {
    this.customerRepository = new CustomerRepository();
    this.customerAuthSessionRepository = new CustomerAuthSessionRepository();
  }

  async signup(signupRequest: SignupRequest): Promise<ModuleResponse> {
    if (await this.customerRepository.existsByMobileNumber(signupRequest.mobileNumber)) {
      return ModuleResponse.generateCustomResponse(400, StateMessages.PHONE_ALREADY_EXIST);
    }

    if (await this.customerRepository.existsByCnic(signupRequest.cnic)) {
      return ModuleResponse.generateCustomResponse(400, 'CNIC is already registered');
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
    customer.mobileNumber = signupRequest.mobileNumber;
    customer.fullName = signupRequest.fullName;
    customer.cnic = signupRequest.cnic;
    customer.email = signupRequest.email;
    customer.dateOfBirth = new Date(signupRequest.dateOfBirth);
    customer.status = this.DEFAULT_CUSTOMER_STATUS; // string
    customer.password = await bcrypt.hash(signupRequest.password, 10);
    customer.externalCustomerId = undefined;
    const now = new Date();
    customer.createdAt = now;
    customer.updatedAt = now;

    const savedCustomer = await this.customerRepository.save(customer);

    console.log('Customer signed up successfully with mobile number: {}', signupRequest.mobileNumber);

    return ModuleResponse.generateCreateResponse(savedCustomer.id.toHexString());
  }

  async getCustomerByMobileNumber(mobileNumber: string): Promise<Customer | null> {
    return await this.customerRepository.findByMobileNumber(mobileNumber);
  }

  async login(loginRequest: LoginRequest): Promise<ModuleResponse> {
    const customer = await this.customerRepository.findByMobileNumber(loginRequest.mobileNumber);

    if (!customer) {
      console.log('Login attempt with non-existent mobile number: {}', loginRequest.mobileNumber);
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

    const userDetails = CustomUserDetails.builder()
      .customerId(customer.id.toHexString())
      .mobileNumber(customer.mobileNumber)
      .fullName(customer.fullName)
      .build();

    const jwtToken = JwtTokenUtil.generateToken(userDetails);
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
      customerId: customer.id.toHexString(),
      mobileNumber: customer.mobileNumber,
      fullName: customer.fullName,
      expiresAt,
    };

    console.log('Customer logged in successfully: {}', customer.id.toHexString());

    return ModuleResponse.generateSuccessResponse(loginResponse);
  }

  async logout(logoutRequest: LogoutRequest): Promise<ModuleResponse> {
    const customer = await this.customerRepository.findByMobileNumber(logoutRequest.mobileNumber);

    if (!customer) {
      console.log('Logout attempt with non-existent mobile number: {}', logoutRequest.mobileNumber);
      return ModuleResponse.generateCustomResponse(400, StateMessages.USER_NOT_FOUND);
    }

    const session = await this.customerAuthSessionRepository.findByCustomerId(customer.id);
    if (!session) {
      console.log('No active session found for customer: {}', customer.id.toHexString());
      return ModuleResponse.generateCustomResponse(400, 'No active session found');
    }

    const now = new Date();
    session.expiresAt = now;
    session.updatedAt = now;
    await this.customerAuthSessionRepository.save(session);

    console.log('Customer logged out successfully: {} (mobile: {})', customer.id.toHexString(), logoutRequest.mobileNumber);

    return ModuleResponse.generateSuccessResponse();
  }
}

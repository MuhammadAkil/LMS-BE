import * as bcrypt from 'bcrypt';
import { UserRepository } from '../repository/UserRepository';
import { UserSessionRepository } from '../repository/UserSessionRepository';
import { User } from '../domain/User';
import { UserSession } from '../domain/UserSession';
import { LoginRequest } from '../dto/LoginRequest';
import { SignupRequest } from '../dto/SignupRequest';
import { LoginResponse } from '../dto/LoginResponse';
import { ModuleResponse } from '../dto/ModuleResponse';
import { JwtTokenUtil } from '../util/JwtTokenUtil';
import { StateMessages } from '../util/StateMessages';

/**
 * User Service
 * Handles authentication logic including signup, login, and logout
 */
export class UserService {
    private userRepository: UserRepository;
    private userSessionRepository: UserSessionRepository;
    private readonly BCRYPT_SALT_ROUNDS = 10;
    private readonly DEFAULT_ROLE_ID = 2; // BORROWER role
    private readonly ACTIVE_STATUS_ID = 2; // ACTIVE status

    constructor() {
        this.userRepository = new UserRepository();
        this.userSessionRepository = new UserSessionRepository();
    }

    /**
     * User signup/registration
     * Creates a new user account with email and password
     */
    async signup(signupRequest: SignupRequest): Promise<ModuleResponse> {
        try {
            // Check if email already exists
            if (await this.userRepository.existsByEmail(signupRequest.email)) {
                return ModuleResponse.generateCustomResponse(
                    400,
                    'Email is already registered. Please use a different email or login.'
                );
            }

            return await this.createNewUser(signupRequest);
        } catch (error: any) {
            console.error('Error during user signup:', error);
            return ModuleResponse.generateServerErrorResponse('Failed to create user account');
        }
    }

    /**
     * Create a new user
     */
    private async createNewUser(signupRequest: SignupRequest): Promise<ModuleResponse> {
        const user = new User();
        user.email = signupRequest.email;
        user.passwordHash = await bcrypt.hash(signupRequest.password, this.BCRYPT_SALT_ROUNDS);
        user.roleId = this.DEFAULT_ROLE_ID; // Default: BORROWER role
        user.statusId = this.ACTIVE_STATUS_ID; // Default: ACTIVE status
        user.level = 0;
        user.phone = signupRequest.phone || null;

        try {
            const savedUser = await this.userRepository.save(user);
            console.log(`User registered successfully with email: ${signupRequest.email}`);

            // Return user ID as the creation response
            return ModuleResponse.generateCreateResponse({
                userId: savedUser.id,
                email: savedUser.email,
                message: 'User account created successfully',
            });
        } catch (error: any) {
            console.error('Database error while creating user:', error);
            throw error;
        }
    }

    /**
     * User login
     * Authenticates user with email and password, returns JWT token
     */
    async login(loginRequest: LoginRequest): Promise<ModuleResponse> {
        try {
            const user = await this.userRepository.findByEmail(loginRequest.email);

            if (!user) {
                console.log(`Login attempt with non-existent email: ${loginRequest.email}`);
                return ModuleResponse.generateCustomResponse(401, StateMessages.INVALID_CREDENTIALS);
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(loginRequest.password, user.passwordHash);
            if (!isPasswordValid) {
                console.log(`Invalid password attempt for user: ${user.id}`);
                return ModuleResponse.generateCustomResponse(401, StateMessages.INVALID_CREDENTIALS);
            }

            // Check if user account is active
            if (user.statusId !== this.ACTIVE_STATUS_ID) {
                console.log(`Login attempt for inactive user: ${user.id}`);
                return ModuleResponse.generateCustomResponse(
                    403,
                    'User account is not active. Please contact support.'
                );
            }

            // Generate JWT token
            const jwtToken = JwtTokenUtil.generateToken(user.id, user.email, user.roleId);
            const expiresAt = new Date(Date.now() + JwtTokenUtil.getTokenExpiration());

            // Delete any existing session for this user and create new one
            await this.userSessionRepository.deleteByUserId(user.id);

            const userSession = new UserSession();
            userSession.userId = user.id;
            userSession.token = jwtToken;
            userSession.expiresAt = expiresAt;

            await this.userSessionRepository.save(userSession);

            const loginResponse = new LoginResponse(
                jwtToken,
                user.id,
                user.email,
                user.roleId,
                expiresAt
            );

            console.log(`User logged in successfully: ${user.email}`);
            return ModuleResponse.generateSuccessResponse(loginResponse);
        } catch (error: any) {
            console.error('Error during login:', error);
            return ModuleResponse.generateServerErrorResponse('Login failed. Please try again.');
        }
    }

    /**
     * User logout
     * Invalidates the user's current session token
     */
    async logout(token: string, userId: number): Promise<ModuleResponse> {
        try {
            // Verify token exists and belongs to user
            const session = await this.userSessionRepository.findByToken(token);

            if (!session) {
                return ModuleResponse.generateCustomResponse(404, 'Session not found');
            }

            if (session.userId !== userId) {
                return ModuleResponse.generateCustomResponse(403, 'Token does not belong to user');
            }

            // Delete the session
            await this.userSessionRepository.deleteByToken(token);

            console.log(`User logged out successfully: ${userId}`);
            return ModuleResponse.generateSuccessResponse({
                message: 'Logged out successfully',
            });
        } catch (error: any) {
            console.error('Error during logout:', error);
            return ModuleResponse.generateServerErrorResponse('Logout failed');
        }
    }

    /**
     * Validate JWT token
     * Checks if token is valid and not expired
     */
    async validateToken(token: string): Promise<boolean> {
        try {
            return await this.userSessionRepository.isTokenValid(token);
        } catch (error: any) {
            console.error('Error validating token:', error);
            return false;
        }
    }

    /**
     * Get user by ID with relations
     */
    async getUserById(userId: number): Promise<User | null> {
        try {
            return await this.userRepository.findByIdWithRelations(userId);
        } catch (error: any) {
            console.error('Error fetching user:', error);
            return null;
        }
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email: string): Promise<User | null> {
        try {
            return await this.userRepository.findByEmail(email);
        } catch (error: any) {
            console.error('Error fetching user by email:', error);
            return null;
        }
    }
}

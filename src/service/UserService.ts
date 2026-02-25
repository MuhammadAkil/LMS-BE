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

            // Check if user account is active — return distinct error codes for frozen/blocked
            if (user.statusId !== this.ACTIVE_STATUS_ID) {
                console.log(`Login attempt for inactive user: ${user.id}, statusId=${user.statusId}`);
                const isBlocked = user.statusId === 3;
                const isFrozen = user.statusId === 4;
                const errorCode = isBlocked ? 'ACCOUNT_BLOCKED' : isFrozen ? 'ACCOUNT_FROZEN' : 'ACCOUNT_NOT_ACTIVE';
                const message = isBlocked
                    ? 'Your account has been blocked. Contact support for assistance.'
                    : isFrozen
                    ? 'Your account is frozen. You can only view data. Contact support for assistance.'
                    : 'Your account is not active. Please contact support.';
                return ModuleResponse.generateCustomResponse(403, message, { errorCode });
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
                expiresAt,
                undefined,
                this.getAccountStatusName(user.statusId),
                user.level ?? 0
            );

            console.log(`User logged in successfully: ${user.email}`);
            return ModuleResponse.generateSuccessResponse(loginResponse);
        } catch (error: any) {
            console.error('Error during login:', error);
            return ModuleResponse.generateServerErrorResponse('Login failed. Please try again.');
        }
    }

    private getAccountStatusName(statusId: number): string {
        const map: Record<number, string> = { 1: 'PENDING', 2: 'ACTIVE', 3: 'BLOCKED', 4: 'FROZEN' };
        return map[statusId] ?? 'PENDING';
    }

    /** Role ID for ADMIN (only role allowed to use admin login endpoint) */
    private readonly ADMIN_ROLE_ID = 1;

    /**
     * Admin login: same as login but returns 403 if user is not ADMIN.
     * Used by POST /api/auth/admin/login. JWT secret must come from env (Config).
     */
    async adminLogin(loginRequest: LoginRequest): Promise<ModuleResponse> {
        try {
            const user = await this.userRepository.findByEmail(loginRequest.email);
            if (!user) {
                return ModuleResponse.generateCustomResponse(401, StateMessages.INVALID_CREDENTIALS);
            }
            const isPasswordValid = await bcrypt.compare(loginRequest.password, user.passwordHash);
            if (!isPasswordValid) {
                return ModuleResponse.generateCustomResponse(401, StateMessages.INVALID_CREDENTIALS);
            }
            if (user.statusId !== this.ACTIVE_STATUS_ID) {
                return ModuleResponse.generateCustomResponse(403, 'User account is not active. Please contact support.');
            }
            // Non-admin trying to use admin login — return 403 per spec
            if (user.roleId !== this.ADMIN_ROLE_ID) {
                return ModuleResponse.generateCustomResponse(403, 'Admin access only. Use the standard login.');
            }
            // 2FA: if enabled, return requires2FA and skip token for now (stub: no OTP flow yet)
            // const has2FA = await this.checkUser2FA(user.id);
            // if (has2FA && !loginRequest.twoFACode) {
            //   return ModuleResponse.generateSuccessResponse({ requires2FA: true });
            // }
            const jwtToken = JwtTokenUtil.generateToken(user.id, user.email, user.roleId);
            const expiresAt = new Date(Date.now() + JwtTokenUtil.getTokenExpiration());
            await this.userSessionRepository.deleteByUserId(user.id);
            const userSession = new UserSession();
            userSession.userId = user.id;
            userSession.token = jwtToken;
            userSession.expiresAt = expiresAt;
            await this.userSessionRepository.save(userSession);
            const loginResponse = new LoginResponse(jwtToken, user.id, user.email, user.roleId, expiresAt);
            return ModuleResponse.generateSuccessResponse(loginResponse);
        } catch (error: any) {
            console.error('Error during admin login:', error);
            return ModuleResponse.generateServerErrorResponse('Login failed. Please try again.');
        }
    }

    /**
     * Change password: verify current password then update to new. Min 8 chars, complexity.
     */
    async changePassword(
        userId: number,
        currentPassword: string,
        newPassword: string
    ): Promise<ModuleResponse> {
        try {
            const user = await this.userRepository.findById(userId);
            if (!user) {
                return ModuleResponse.generateCustomResponse(404, 'User not found');
            }
            const valid = await bcrypt.compare(currentPassword, user.passwordHash);
            if (!valid) {
                return ModuleResponse.generateCustomResponse(401, 'Current password is incorrect');
            }
            if (newPassword.length < 8) {
                return ModuleResponse.generateCustomResponse(400, 'New password must be at least 8 characters');
            }
            const hasUpper = /[A-Z]/.test(newPassword);
            const hasLower = /[a-z]/.test(newPassword);
            const hasNumber = /\d/.test(newPassword);
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
            if (!(hasUpper && hasLower && (hasNumber || hasSpecial))) {
                return ModuleResponse.generateCustomResponse(
                    400,
                    'New password must contain uppercase, lowercase, and a number or special character'
                );
            }
            user.passwordHash = await bcrypt.hash(newPassword, this.BCRYPT_SALT_ROUNDS);
            await this.userRepository.save(user);
            return ModuleResponse.generateSuccessResponse({ message: 'Password changed successfully' });
        } catch (error: any) {
            console.error('Error during change password:', error);
            return ModuleResponse.generateServerErrorResponse('Failed to change password');
        }
    }

    /**
     * User logout
     * Expires the user's latest session by setting expires_at to now.
     * No auth required: call with body { userId }. Idempotent: returns success
     * even if no active session exists.
     */
    async logout(userIdFromBody: number, _authenticatedUserId?: number): Promise<ModuleResponse> {
        try {
            const updated = await this.userSessionRepository.expireLatestSessionByUserId(userIdFromBody);
            if (updated) {
                console.log(`User logged out successfully: userId=${userIdFromBody}`);
            }
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

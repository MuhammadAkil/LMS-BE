import * as jwt from 'jsonwebtoken';
import config from '../config/Config';

/**
 * JWT Token Utility
 * Handles token generation, validation, and extraction of claims
 */
export class JwtTokenUtil {
  private static readonly SECRET = config.jwt.secret;
  private static readonly JWT_TOKEN_VALIDITY = config.jwt.expiration; // 8 hours in milliseconds
  private static readonly CLAIM_USER_ID = 'userId';
  private static readonly CLAIM_EMAIL = 'email';
  private static readonly CLAIM_ROLE_ID = 'roleId';

  /**
   * Generate JWT token for user
   * @param userId - User ID
   * @param email - User email
   * @param roleId - User role ID
   * @returns JWT token string
   */
  static generateToken(userId: number, email: string, roleId: number): string {
    const claims: any = {
      [this.CLAIM_USER_ID]: userId,
      [this.CLAIM_EMAIL]: email,
      [this.CLAIM_ROLE_ID]: roleId,
    };

    return jwt.sign(claims, this.SECRET, {
      expiresIn: this.JWT_TOKEN_VALIDITY / 1000, // Convert to seconds
      algorithm: 'HS512',
    });
  }

  /**
   * Get user ID from token
   * @param token - JWT token
   * @returns User ID
   */
  static getUserIdFromToken(token: string): number {
    try {
      const decoded = jwt.verify(token, this.SECRET) as jwt.JwtPayload;
      return (decoded[this.CLAIM_USER_ID] as number) || 0;
    } catch (error) {
      console.error('Error extracting user ID from token:', error);
      throw error;
    }
  }

  /**
   * Get email from token
   * @param token - JWT token
   * @returns User email
   */
  static getEmailFromToken(token: string): string {
    try {
      const decoded = jwt.verify(token, this.SECRET) as jwt.JwtPayload;
      return (decoded[this.CLAIM_EMAIL] as string) || '';
    } catch (error) {
      console.error('Error extracting email from token:', error);
      throw error;
    }
  }

  /**
   * Get role ID from token
   * @param token - JWT token
   * @returns Role ID
   */
  static getRoleIdFromToken(token: string): number {
    try {
      const decoded = jwt.verify(token, this.SECRET) as jwt.JwtPayload;
      return (decoded[this.CLAIM_ROLE_ID] as number) || 0;
    } catch (error) {
      console.error('Error extracting role ID from token:', error);
      throw error;
    }
  }

  /**
   * Get all claims from token
   * @param token - JWT token
   * @returns Decoded JWT payload
   */
  static decodeToken(token: string): jwt.JwtPayload {
    try {
      return jwt.verify(token, this.SECRET) as jwt.JwtPayload;
    } catch (error) {
      console.error('Error decoding token:', error);
      throw error;
    }
  }

  /**
   * Get expiration date from token
   * @param token - JWT token
   * @returns Expiration date
   */
  static getExpirationDateFromToken(token: string): Date {
    try {
      const decoded = jwt.verify(token, this.SECRET) as jwt.JwtPayload;
      return new Date((decoded.exp || 0) * 1000);
    } catch (error) {
      console.error('Error extracting expiration from token:', error);
      throw error;
    }
  }

  /**
   * Validate JWT token
   * @param token - JWT token
   * @returns true if token is valid, false otherwise
   */
  static validateToken(token: string): boolean {
    try {
      jwt.verify(token, this.SECRET);
      return true;
    } catch (error) {
      console.log('Token validation failed:', error);
      return false;
    }
  }

  /**
   * Get token expiration duration in milliseconds
   * @returns Token validity period in milliseconds
   */
  static getTokenExpiration(): number {
    return this.JWT_TOKEN_VALIDITY;
  }

  /**
   * Get expiration date for new token
   * @returns Future date when token will expire
   */
  static getTokenExpirationDate(): Date {
    const now = new Date();
    return new Date(now.getTime() + this.JWT_TOKEN_VALIDITY);
  }

  /**
   * Extract token from Authorization header
   * @param authHeader - Authorization header value (e.g., "Bearer token")
   * @returns Token string or null if invalid format
   */
  static extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    return parts[1];
  }
}


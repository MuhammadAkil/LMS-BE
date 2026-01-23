import * as jwt from 'jsonwebtoken';
import { CustomUserDetails } from '../security/CustomUserDetails';
import config from '../config/Config';

export class JwtTokenUtil {
  private static readonly SECRET = config.jwt.secret;
  private static readonly JWT_TOKEN_VALIDITY = config.jwt.expiration; // 5 hours in milliseconds
  private static readonly CLAIM_CUSTOMER_ID = 'customerId';
  private static readonly CLAIM_FULL_NAME = 'fullName';

  static getMobileNumberFromToken(token: string): string {
    const decoded = jwt.verify(token, this.SECRET) as jwt.JwtPayload;
    return decoded.sub || '';
  }

  static getCustomerIdFromToken(token: string): string {
    const decoded = jwt.verify(token, this.SECRET) as jwt.JwtPayload;
    return decoded[this.CLAIM_CUSTOMER_ID] as string;
  }

  static getExpirationDateFromToken(token: string): Date {
    const decoded = jwt.verify(token, this.SECRET) as jwt.JwtPayload;
    return new Date((decoded.exp || 0) * 1000);
  }

  static generateToken(userDetails: CustomUserDetails): string {
    const claims: any = {
      [this.CLAIM_CUSTOMER_ID]: userDetails.customerId,
      [this.CLAIM_FULL_NAME]: userDetails.fullName,
    };

    return jwt.sign(
      claims,
      this.SECRET,
      {
        subject: userDetails.mobileNumber,
        expiresIn: this.JWT_TOKEN_VALIDITY / 1000, // Convert to seconds
        algorithm: 'HS512',
      }
    );
  }

  static validateToken(token: string, customerId: string): boolean {
    try {
      const tokenCustomerId = this.getCustomerIdFromToken(token);
      const decoded = jwt.verify(token, this.SECRET) as jwt.JwtPayload;
      const expiration = new Date((decoded.exp || 0) * 1000);
      return tokenCustomerId === customerId && expiration > new Date();
    } catch (error) {
      console.log('Error validating JWT token:', error);
      return false;
    }
  }

  static getTokenExpirationDate(): Date {
    const now = new Date();
    return new Date(now.getTime() + this.JWT_TOKEN_VALIDITY);
  }
}

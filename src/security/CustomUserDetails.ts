export class CustomUserDetails {
  // Customer fields (for regular users)
  customerId?: String;
  mobileNumber?: string;
  fullName?: string;

  // User fields (for admin users)
  id?: number;
  userId?: number;
  email?: string;
  roleId?: number;
  isSuperAdmin?: boolean;
  twoFAVerified?: boolean;

  static builder(): CustomUserDetailsBuilder {
    return new CustomUserDetailsBuilder();
  }
}

export class CustomUserDetailsBuilder {
  private userDetails: CustomUserDetails;

  constructor() {
    this.userDetails = new CustomUserDetails();
  }

  customerId(customerId: String): this {
    this.userDetails.customerId = customerId;
    return this;
  }

  mobileNumber(mobileNumber: string): this {
    this.userDetails.mobileNumber = mobileNumber;
    return this;
  }

  fullName(fullName: string): this {
    this.userDetails.fullName = fullName;
    return this;
  }

  build(): CustomUserDetails {
    return this.userDetails;
  }
}

/**
 * Enums for all lookup table values
 * These are mapped to the database lookup tables
 * Should be kept in sync with database seeding scripts
 */

export enum UserStatusCode {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  FROZEN = 'FROZEN',
}

export enum UserRoleCode {
  ADMIN = 'ADMIN',
  BORROWER = 'BORROWER',
  LENDER = 'LENDER',
  COMPANY = 'COMPANY',
}

export enum VerificationTypeCode {
  KYC = 'KYC',
  BANK = 'BANK',
  INCOME = 'INCOME',
  BUSINESS = 'BUSINESS',
  INDIVIDUAL_IDENTITY = 'INDIVIDUAL_IDENTITY',
  INDIVIDUAL_PROOF_OF_ADDRESS = 'INDIVIDUAL_PROOF_OF_ADDRESS',
  COMPANY_REGISTRATION = 'COMPANY_REGISTRATION',
  COMPANY_DIRECTOR_IDENTITY = 'COMPANY_DIRECTOR_IDENTITY',
  COMPANY_PROOF_OF_ADDRESS = 'COMPANY_PROOF_OF_ADDRESS',
}

export enum VerificationStatusCode {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum LoanApplicationStatusCode {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum LoanStatusCode {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  DEFAULT = 'DEFAULT',
  RESTRUCTURED = 'RESTRUCTURED',
}

export enum PaymentTypeCode {
  INSTALLMENT = 'INSTALLMENT',
  FULL = 'FULL',
  PARTIAL = 'PARTIAL',
  INTEREST = 'INTEREST',
}

export enum PaymentProviderCode {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  WALLET = 'WALLET',
  USSD = 'USSD',
}

export enum PaymentStatusCode {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum ExportTypeCode {
  XML = 'XML',
  CSV = 'CSV',
  LAWSUITS = 'LAWSUITS',
}

export enum AdminActionCode {
  // Dashboard
  VIEW_DASHBOARD = 'VIEW_DASHBOARD',
  // User Management
  USER_STATUS_CHANGED = 'USER_STATUS_CHANGED',
  USER_LEVEL_CHANGED = 'USER_LEVEL_CHANGED',
  VIEW_USER_AUDIT = 'VIEW_USER_AUDIT',
  // Verification
  VERIFICATION_APPROVED = 'VERIFICATION_APPROVED',
  VERIFICATION_REJECTED = 'VERIFICATION_REJECTED',
  VERIFICATION_REVIEWED = 'VERIFICATION_REVIEWED',
  // Configuration
  CONFIG_LOAN_RULES_UPDATED = 'CONFIG_LOAN_RULES_UPDATED',
  CONFIG_LEVEL_RULES_UPDATED = 'CONFIG_LEVEL_RULES_UPDATED',
  CONFIG_FEES_UPDATED = 'CONFIG_FEES_UPDATED',
  CONFIG_REMINDERS_UPDATED = 'CONFIG_REMINDERS_UPDATED',
  CONFIG_RETENTION_UPDATED = 'CONFIG_RETENTION_UPDATED',
  // Templates
  TEMPLATE_CREATED = 'TEMPLATE_CREATED',
  TEMPLATE_UPDATED = 'TEMPLATE_UPDATED',
  TEMPLATE_DEPRECATED = 'TEMPLATE_DEPRECATED',
  // Companies
  COMPANY_APPROVED = 'COMPANY_APPROVED',
  COMPANY_REJECTED = 'COMPANY_REJECTED',
  // Exports
  EXPORT_XML_GENERATED = 'EXPORT_XML_GENERATED',
  EXPORT_CSV_GENERATED = 'EXPORT_CSV_GENERATED',
  EXPORT_CLAIMS_GENERATED = 'EXPORT_CLAIMS_GENERATED',
  // Audit & Retention
  RETENTION_OVERRIDE = 'RETENTION_OVERRIDE',
  AUDIT_LOG_ACCESSED = 'AUDIT_LOG_ACCESSED',
}

export const LookupTableMapping = {
  userStatus: UserStatusCode,
  userRole: UserRoleCode,
  verificationType: VerificationTypeCode,
  verificationStatus: VerificationStatusCode,
  loanApplicationStatus: LoanApplicationStatusCode,
  loanStatus: LoanStatusCode,
  paymentType: PaymentTypeCode,
  paymentProvider: PaymentProviderCode,
  paymentStatus: PaymentStatusCode,
  exportType: ExportTypeCode,
  adminAction: AdminActionCode,
};

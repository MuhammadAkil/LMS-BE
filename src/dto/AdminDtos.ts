import { IsNotEmpty, IsString, IsEmail, IsInt, IsOptional, Min, Max, IsEnum, IsJSON } from 'class-validator';

// ==================== DASHBOARD DTOs ====================

export class DashboardStatsResponse {
  totalUsers!: number;
  activeUsers!: number;
  blockedUsers!: number;
  pendingVerifications!: number;
  activeLoans!: number;
  defaultedLoans!: number;
  totalPayments!: number;
  failedPayments!: number;
  totalAmount!: number;
  activeCompanies!: number;
  timestamp!: Date;
  /** Users count by role (spec) */
  usersByRole?: { borrower: number; lender: number; company: number };
  /** Outstanding principal across active loans (PLN) */
  outstandingPLN?: number;
  /** Alias for FE */
  outstandingAmount?: number;
  /** Total commissions earned */
  commissionsTotal?: number;
  /** Default rate as percentage (defaulted / total loans) */
  defaultRate?: number;
  /** Total disbursed (funded loan amounts) for FE */
  totalDisbursed?: number;
  /** Recovery rate % for FE */
  recoveryRate?: number;
  /** Alias for defaultedLoans for FE */
  defaults?: number;
}

export class AlertDto {
  id!: string;
  type!: string; // PENDING_VERIFICATION, OVERDUE_LOAN, FAILED_PAYMENT
  severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title!: string;
  description!: string;
  affectedCount!: number;
  createdAt!: Date;
}

export class DashboardAlertsResponse {
  alerts!: AlertDto[];
  totalCount!: number;
  criticalCount!: number;
  highCount!: number;
}

// ==================== USER MANAGEMENT DTOs ====================

export class UserListItemDto {
  id!: number;
  email!: string;
  roleId!: number;
  roleName!: string;
  statusId!: number;
  statusName!: string;
  level!: number;
  phone?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class UserDetailDto {
  id!: number;
  email!: string;
  roleId!: number;
  roleName!: string;
  statusId!: number;
  statusName!: string;
  level!: number;
  phone?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class UpdateUserStatusRequest {
  @IsNotEmpty({ message: 'Status ID is required' })
  @IsInt()
  statusId!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateUserLevelRequest {
  @IsNotEmpty({ message: 'Level is required' })
  @IsInt()
  @Min(0)
  @Max(10)
  level!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

// ==================== VERIFICATION DTOs ====================

export class VerificationListItemDto {
  id!: number;
  userId!: number;
  userEmail!: string;
  typeId!: number;
  typeName!: string;
  statusId!: number;
  statusName!: string;
  submittedAt!: Date;
  reviewedAt?: Date;
  reviewedBy?: number;
}

export class VerificationDetailDto {
  id!: number;
  userId!: number;
  userEmail!: string;
  typeId!: number;
  typeName!: string;
  statusId!: number;
  statusName!: string;
  submittedAt!: Date;
  reviewedAt?: Date;
  reviewedBy?: number;
  reviewerEmail?: string;
  reviewComment?: string;
  metadata?: Record<string, any>;
}

export class ApproveVerificationRequest {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectVerificationRequest {
  @IsNotEmpty({ message: 'Rejection comment is required' })
  @IsString()
  comment!: string;
}

// ==================== PLATFORM CONFIG DTOs ====================

export class PlatformConfigDto {
  id!: number;
  key!: string;
  value!: any;
  description?: string;
  version!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export class UpdateLoanRulesRequest {
  @IsOptional()
  minAmount?: number;

  @IsOptional()
  maxAmount?: number;

  @IsOptional()
  minTenor?: number;

  @IsOptional()
  maxTenor?: number;

  @IsOptional()
  minInterestRate?: number;

  @IsOptional()
  maxInterestRate?: number;
}

export class UpdateLevelRulesRequest {
  @IsOptional()
  level0Amount?: number;

  @IsOptional()
  level1Amount?: number;

  @IsOptional()
  level2Amount?: number;

  @IsOptional()
  level3Amount?: number;
}

export class UpdateFeesRequest {
  @IsOptional()
  processingFee?: number;

  @IsOptional()
  latePenaltyRate?: number;

  @IsOptional()
  prePaymentPenaltyRate?: number;
}

export class UpdateRemindersRequest {
  @IsOptional()
  dueDateReminderDays?: number;

  @IsOptional()
  latepaymentReminderDays?: number;

  @IsOptional()
  reminderFrequency?: string;
}

export class UpdateRetentionRequest {
  @IsOptional()
  dataRetentionDays?: number;

  @IsOptional()
  auditLogRetentionYears?: number;

  @IsOptional()
  archiveExportedData?: boolean;
}

// ==================== TEMPLATE DTOs ====================

export class TemplateDto {
  id!: number;
  type!: string;
  language!: string; // PL, EN
  content!: string;
  subject?: string;
  deprecated!: boolean;
  deprecatedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export class CreateTemplateRequest {
  @IsNotEmpty({ message: 'Type is required' })
  @IsString()
  type!: string;

  @IsNotEmpty({ message: 'Language is required' })
  @IsEnum(['PL', 'EN'])
  language!: string;

  @IsNotEmpty({ message: 'Content is required' })
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  subject?: string;
}

export class UpdateTemplateRequest {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  subject?: string;
}

export class DeprecateTemplateRequest {
  @IsOptional()
  @IsString()
  reason?: string;
}

// ==================== COMPANY DTOs ====================

export class CompanyListItemDto {
  id!: number;
  name!: string;
  statusId!: number;
  statusName!: string;
  bankAccount?: string;
  createdAt!: Date;
}

/** Performance KPIs for admin company detail */
export interface CompanyPerformanceKpisDto {
  performanceScore?: number;
  activeLoans?: number;
  totalLoans?: number;
  defaultRate?: number;
}

/** Financial metrics for admin company detail */
export interface CompanyFinancialMetricsDto {
  managedFunds?: number;
  minManagedAmount?: number;
  commission?: number;
}

export class CompanyDetailDto {
  id!: number;
  name!: string;
  statusId!: number;
  statusName!: string;
  bankAccount?: string;
  conditions?: Record<string, any>;
  approvedAt?: Date;
  commissionPct?: number;
  minManagedAmount?: number;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
  /** Registered/created date for display */
  registeredDate?: Date;
  /** Performance KPIs (flat for FE modal) */
  performanceKpis?: CompanyPerformanceKpisDto;
  /** Financial metrics (flat for FE modal) */
  financialMetrics?: CompanyFinancialMetricsDto;
  /** Flat fields for FE: managedFunds, commission (%), performanceScore, activeLoans, totalLoans, defaultRate (%) */
  managedFunds?: number;
  commission?: number;
  performanceScore?: number;
  activeLoans?: number;
  totalLoans?: number;
  defaultRate?: number;
}

export class ApproveCompanyRequest {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectCompanyRequest {
  @IsNotEmpty({ message: 'Rejection comment is required' })
  @IsString()
  comment!: string;
}

export class UpdateCompanyConditionsRequest {
  @IsOptional()
  commissionPct?: number;

  @IsOptional()
  minManagedAmount?: number;

  @IsOptional()
  metadata?: Record<string, any>;
}

// ==================== EXPORT DTOs ====================

export class ExportListItemDto {
  id!: number;
  typeId!: number;
  typeName!: string;
  createdBy!: number;
  creatorEmail!: string;
  recordCount!: number;
  createdAt!: Date;
}

export class GenerateXMLExportRequest {
  @IsOptional()
  @IsInt()
  limit?: number; // Max 500

  @IsOptional()
  loanStatus?: string[];

  @IsOptional()
  dateFrom?: Date;

  @IsOptional()
  dateTo?: Date;
}

export class GenerateCSVExportRequest {
  @IsOptional()
  @IsInt()
  limit?: number;

  @IsOptional()
  entityType?: string; // USERS, LOANS, PAYMENTS

  @IsOptional()
  filters?: Record<string, any>;
}

export class GenerateClaimsRequest {
  @IsNotEmpty({ message: 'Loan IDs are required' })
  loanIds!: number[];

  @IsOptional()
  courtName?: string;

  @IsOptional()
  caseNumber?: string;
}

export class ExportHistoryDto {
  id!: number;
  type!: string;
  createdBy!: string;
  recordCount!: number;
  createdAt!: Date;
  status!: string;
}

// ==================== AUDIT LOG DTOs ====================

export class AuditLogDto {
  id!: number;
  actorId!: number;
  actorEmail!: string;
  action!: string;
  entity!: string;
  entityId!: number;
  metadata?: Record<string, any>;
  createdAt!: Date;
}

export class AuditLogFilterRequest {
  @IsOptional()
  action?: string;

  @IsOptional()
  entity?: string;

  @IsOptional()
  actorId?: number;

  @IsOptional()
  dateFrom?: Date;

  @IsOptional()
  dateTo?: Date;

  @IsOptional()
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsInt()
  offset?: number;
}

export class RetentionScheduleDto {
  dataType!: string;
  retentionDays!: number;
  lastCleanupAt?: Date;
  nextCleanupAt!: Date;
  recordsToDelete!: number;
}

export class RetentionOverrideRequest {
  @IsNotEmpty({ message: 'Data type is required' })
  @IsString()
  dataType!: string;

  @IsNotEmpty({ message: 'Reason is required' })
  @IsString()
  reason!: string;

  @IsOptional()
  @IsInt()
  additionalRetentionDays?: number;
}

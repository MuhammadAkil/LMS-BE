import { IsNotEmpty, IsString, IsEmail, IsInt, IsOptional, Min, Max, IsEnum, IsNumberString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// ==================== GENERIC RESPONSE DTOs ====================

export interface BorrowerApiResponse<T> {
    statusCode: string;
    statusMessage: string;
    data?: T;
    errors?: string[];
    timestamp: string;
}

export interface PaginationParams {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
}

export interface ValidationErrorResponse {
    statusCode: string;
    statusMessage: string;
    errors: Array<{ field: string; message: string }>;
    timestamp: string;
}

// ==================== B-01: DASHBOARD DTOs ====================

export class BorrowerDashboardStatsDto {
    verificationLevel!: number; // 0-3: F, 1, 2, 3
    availableLoanLimit!: number; // From level_rules table
    activeLoanCount!: number;
    activeInvestmentCount!: number; // Count of active investments (loan_offers)
    nextRepaymentDueDate?: string; // ISO date or null
    nextRepaymentAmount?: number;
    totalOutstandingAmount!: number;
    timestamp!: string;
}

export class AlertDto {
    id!: string;
    type!: string; // PENDING_VERIFICATION, PAYMENT_OVERDUE, COMMISSION_PENDING
    severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title!: string;
    description!: string;
    actionUrl?: string;
    createdAt!: string;
}

export class BorrowerDashboardAlertsResponse {
    alerts!: AlertDto[];
    totalCount!: number;
    criticalCount!: number;
    highCount!: number;
}

// ==================== B-02: VERIFICATION CENTER DTOs ====================

export class VerificationStatusDto {
    level!: number; // 0-3
    levelName!: string; // F, 1, 2, 3
    isVerified!: boolean;
    pendingVerificationType?: string;
    verifications!: VerificationItemDto[];
}

export class VerificationItemDto {
    id!: number;
    type!: string; // EMAIL, PHONE, KYC, BANK
    status!: string; // PENDING, APPROVED, REJECTED
    submittedAt?: string; // ISO date
    approvedAt?: string;
    rejectionReason?: string;
}

export class VerificationRequirementsDto {
    currentLevel!: number;
    nextLevel!: number;
    requirements!: RequirementDto[];
}

export class RequirementDto {
    id!: string;
    type!: string; // EMAIL, PHONE, KYC, etc.
    description!: string;
    isRequired!: boolean;
    isCompleted!: boolean;
    expiresAt?: string; // ISO date
}

export class UploadVerificationRequest {
    @IsNotEmpty({ message: 'Verification type is required' })
    @IsString()
    verificationType!: string; // EMAIL, PHONE, KYC, BANK

    @IsArray({ message: 'Documents must be an array' })
    @ValidateNested({ each: true })
    @Type(() => VerificationDocumentDto)
    documents!: VerificationDocumentDto[];
}

export class VerificationDocumentDto {
    @IsNotEmpty({ message: 'File name is required' })
    @IsString()
    fileName!: string;

    @IsNotEmpty({ message: 'File path is required' })
    @IsString()
    filePath!: string; // S3 path or local path
}

export class UploadVerificationResponse {
    verificationId!: number;
    type!: string;
    status!: string; // PENDING
    submittedAt!: string;
    message!: string;
}

// ==================== B-03: LOAN APPLICATION DTOs ====================

export class CreateApplicationRequest {
    @IsNotEmpty({ message: 'Loan amount is required' })
    @IsInt()
    @Min(100, { message: 'Minimum loan amount is 100' })
    amount!: number;

    @IsNotEmpty({ message: 'Loan duration is required' })
    @IsInt()
    @Min(1, { message: 'Minimum duration is 1 month' })
    @Max(60, { message: 'Maximum duration is 60 months' })
    durationMonths!: number;

    @IsOptional()
    @IsString()
    purpose?: string;

    @IsOptional()
    @IsString()
    description?: string;

    /** Voluntary lender fee in PLN (optional, default 0). Used in commission formula: (amount + voluntaryFee) × rate */
    @IsOptional()
    @Min(0)
    voluntaryCommission?: number;

    // ---- Marketplace fields (optional) ----

    /** Funding window duration in hours (24–168). Defaults to 72. */
    @IsOptional()
    @IsInt()
    @Min(24)
    @Max(168)
    fundingWindowHours?: number;

    /** Minimum funding threshold percentage (0–100) required before borrower can close. Defaults to 50. */
    @IsOptional()
    @Min(0)
    @Max(100)
    minFundingThreshold?: number;

    /** Whether the loan auto-closes when autoCloseThreshold is reached. */
    @IsOptional()
    autoClose?: boolean;

    /** Percentage at which the loan auto-closes (only used when autoClose=true). */
    @IsOptional()
    @Min(0)
    @Max(100)
    autoCloseThreshold?: number;

    /** Whether the loan is publicly visible to all lenders. Defaults to true. */
    @IsOptional()
    isPublic?: boolean;
}

export class ApplicationListItemDto {
    id!: number;
    amount!: number;
    durationMonths!: number;
    status!: string;
    statusId!: number;
    fundedPercent!: number;
    fundedAmount!: number;
    remainingAmount?: number;
    createdAt!: string;
    expectedFundingDate?: string;
    commissionStatus?: string;
    // Marketplace fields
    fundingWindowHours?: number;
    minFundingThreshold?: number;
    autoClose?: boolean;
    autoCloseThreshold?: number;
    isPublic?: boolean;
}

export class ApplicationDetailDto {
    id!: number;
    amount!: number;
    durationMonths!: number;
    status!: string;
    statusId!: number;
    fundedPercent!: number;
    fundedAmount!: number;
    remainingAmount!: number;
    purpose?: string;
    description?: string;
    commissionRequired!: number;
    commissionStatus!: string;
    voluntaryCommission?: number;
    interestRate?: number;
    createdAt!: string;
    expectedFundingDate?: string;
    activatedAt?: string;
    closedAt?: string;
    offers!: OfferSummaryDto[];
    // Marketplace fields
    fundingWindowHours?: number;
    minFundingThreshold?: number;
    autoClose?: boolean;
    autoCloseThreshold?: number;
    isPublic?: boolean;
}

export class OfferSummaryDto {
    id!: number;
    lenderId!: number;
    amount!: number;
    annualRate!: number;
    status!: string; // OPEN, ACCEPTED
    createdAt!: string;
}

export class ApplicationListResponse {
    applications!: ApplicationListItemDto[];
    pagination!: PaginationParams;
}

export class CancelApplicationRequest {
    @IsOptional()
    @IsString()
    reason?: string;
}

export class CancelApplicationResponse {
    applicationId!: number;
    status!: string; // CANCELLED
    cancelledAt!: string;
    message!: string;
}

export class CloseApplicationRequest {
    @IsOptional()
    @IsString()
    notes?: string;
}

export class CloseApplicationResponse {
    applicationId!: number;
    status!: string; // CLOSED
    closedAt!: string;
    fundedAmount!: number;
    unfundedAmount!: number;
}

// ==================== B-04: COMMISSION PAYMENT DTOs ====================

export class InitiateCommissionPaymentRequest {
    @IsNotEmpty({ message: 'Application ID is required' })
    @IsInt()
    applicationId!: number;

    @IsNotEmpty({ message: 'Payment method is required' })
    @IsString()
    paymentMethod!: string; // CARD, BANK_TRANSFER, WALLET, PRZELEWY24

    @IsOptional()
    @IsString()
    returnUrl?: string;
}

export class CommissionPaymentStatusDto {
    paymentId!: number;
    applicationId!: number;
    amount!: number;
    status!: string; // PENDING, PAID, FAILED, CANCELLED
    paymentMethod!: string;
    createdAt!: string;
    completedAt?: string;
    failureReason?: string;
}

// ==================== B-05: ACTIVE LOANS DTOs ====================

export class ActiveLoanListItemDto {
    id!: number;
    applicationId!: number;
    amount!: number;
    durationMonths!: number;
    status!: string; // ACTIVE, REPAYING, COMPLETED, DEFAULTED
    disbursedAmount!: number;
    disbursedAt!: string;
    expectedCompletionDate!: string;
    nextRepaymentDate?: string;
    nextRepaymentAmount?: number;
    remainingBalance!: number;
}

export class ActiveLoanListResponse {
    loans!: ActiveLoanListItemDto[];
    pagination!: PaginationParams;
    totalOutstandingBalance!: number;
}

export class LoanDetailDto {
    id!: number;
    applicationId!: number;
    amount!: number;
    durationMonths!: number;
    status!: string;
    disbursedAmount!: number;
    disbursedAt!: string;
    expectedCompletionDate!: string;
    actualCompletionDate?: string;
    remainingBalance!: number;
    paidAmount!: number;
    nextRepaymentDate?: string;
    nextRepaymentAmount?: number;
    delayedPaymentsCount!: number;
    repaymentSchedule!: RepaymentScheduleItemDto[];
}

export class RepaymentScheduleItemDto {
    dueDate!: string; // ISO date
    amount!: number;
    status!: string; // PENDING, PAID, OVERDUE
    paidAmount?: number;
    paidDate?: string;
    days_overdue?: number;
}

export class PaymentHistoryDto {
    payments!: PaymentItemDto[];
    pagination!: PaginationParams;
    totalPaid!: number;
}

export class PaymentItemDto {
    id!: number;
    amount!: number;
    status!: string; // PAID, FAILED, PENDING
    paymentMethod!: string;
    paidDate?: string;
    failureReason?: string;
    reference?: string;
}

// ==================== B-06: LOAN HISTORY DTOs ====================

export class LoanHistoryListItemDto {
    id!: number;
    applicationId!: number;
    amount!: number;
    durationMonths!: number;
    status!: string; // REPAID, DEFAULTED
    disbursedAt!: string;
    completedAt?: string;
    totalRepaid!: number;
    totalInterestPaid?: number;
}

export class LoanHistoryListResponse {
    loans!: LoanHistoryListItemDto[];
    pagination!: PaginationParams;
    totalHistoricalAmount!: number;
}

export class LoanHistoryDetailDto extends LoanDetailDto {
    contract!: ContractDto;
    finalPaymentDate?: string;
    totalInterestPaid?: number;
}

export class ContractDto {
    id!: number;
    loanId!: number;
    documentPath!: string;
    createdAt!: string;
    signedAt?: string;
    downloadUrl?: string;
}

// ==================== B-07: DOCUMENT CENTER DTOs ====================

export class DocumentListItemDto {
    id!: number;
    type!: string; // CONTRACT, VERIFICATION, SCHEDULE, STATEMENT
    name!: string;
    relatedEntity!: string; // LOAN, APPLICATION, VERIFICATION
    relatedEntityId!: number;
    createdAt!: string;
    expiresAt?: string;
    downloadUrl?: string;
    status?: string;     // PENDING, APPROVED, REJECTED, verified
    filePath?: string;   // internal path reference
}

export class DocumentListResponse {
    documents!: DocumentListItemDto[];
    pagination!: PaginationParams;
}

export class DocumentDetailDto {
    id!: number;
    type!: string;
    name!: string;
    relatedEntity!: string;
    relatedEntityId!: number;
    createdAt!: string;
    expiresAt?: string;
    mimeType!: string;
    size!: number; // Bytes
    downloadUrl?: string;
}

// ==================== B-08: NOTIFICATIONS DTOs ====================

export class NotificationListItemDto {
    id!: number | string; // number for local, string for push service (e.g. MongoDB ObjectId)
    type!: string; // VERIFICATION_REQUIRED, PAYMENT_DUE, assignment_reminder, grade_posted, etc.
    title!: string;
    message!: string;
    isRead!: boolean;
    createdAt!: string;
    readAt?: string;
}

export class NotificationListResponse {
    notifications!: NotificationListItemDto[];
    pagination!: PaginationParams;
    unreadCount!: number;
}

export class MarkNotificationReadRequest {
    @IsOptional()
    notificationId?: number | string; // If not provided, mark all as read. String for push service ids.
}

export class MarkNotificationReadResponse {
    markedCount!: number;
    message!: string;
}

/** Request body for registering FCM device token with the push notification service */
export class RegisterDeviceTokenRequestDto {
    @IsNotEmpty({ message: 'deviceId is required' })
    @IsString()
    deviceId!: string;

    @IsNotEmpty({ message: 'platform is required' })
    @IsString()
    platform!: 'ios' | 'android' | 'web';

    @IsNotEmpty({ message: 'fcmToken is required' })
    @IsString()
    fcmToken!: string;
}

// ==================== B-09: PROFILE DTOs ====================

export class ProfileDto {
    id!: number;
    email!: string;
    firstName!: string;
    lastName!: string;
    phone!: string;
    dateOfBirth?: string; // ISO date
    roleId!: number;
    statusId!: number;
    statusName!: string;
    verificationLevel!: number;
    /** not_started | in_progress | pending_approval | approved */
    verificationStatus!: string;
    createdAt!: string;
    updatedAt!: string;
    twoFAEnabled!: boolean;
    availableLoanLimit?: number;
}

export class UpdateProfileRequest {
    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    dateOfBirth?: string; // ISO date
}

export class UpdateProfileResponse {
    id!: number;
    email!: string;
    firstName!: string;
    lastName!: string;
    phone!: string;
    updatedAt!: string;
    message!: string;
}

export class ActivityItemDto {
    timestamp!: string; // ISO date
    action!: string; // APPLICATION_CREATED, PAYMENT_MADE, VERIFICATION_SUBMITTED, etc.
    entity!: string; // APPLICATION, PAYMENT, VERIFICATION, etc.
    entityId!: number;
    description!: string;
    status!: string; // SUCCESS, FAILED, PENDING
}

export class ProfileActivityResponse {
    activities!: ActivityItemDto[];
    pagination!: PaginationParams;
}

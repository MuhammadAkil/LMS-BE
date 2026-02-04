import {
    IsNotEmpty,
    IsString,
    IsInt,
    IsOptional,
    IsEmail,
    IsDecimal,
    Min,
    Max,
    IsEnum,
    IsBoolean,
    IsArray,
    ValidateNested,
    IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

// ==================== DASHBOARD DTOs ====================

export class CompanyDashboardResponse {
    managedFunds!: number; // sum of management_agreements.amount
    activeManagedLoans!: number;
    defaultedLoans!: number;
    automationStatus!: {
        rulesCount: number;
        activeRules: number;
        automatedTransactionsLast30Days: number;
    };
    recentBulkActions!: BulkActionSummaryDto[];
    agreementStatus!: {
        isSigned: boolean;
        signedAt?: Date;
        amount?: number;
    };
    timestamp!: Date;
}

export class BulkActionSummaryDto {
    id!: number;
    type!: string; // REMINDERS, CSV_EXPORT, XML_EXPORT, CLAIMS
    itemCount!: number;
    status!: string;
    createdAt!: Date;
}

// ==================== PROFILE DTOs ====================

export class CompanyProfileResponse {
    id!: number;
    name!: string;
    bankAccount?: string;
    statusId!: number;
    statusName!: string;
    conditionsJson?: any;
    approvedAt?: Date;
    createdAt!: Date;
    updatedAt!: Date;
}

export class UpdateCompanyBankAccountRequest {
    @IsNotEmpty({ message: 'Bank account is required' })
    @IsString()
    bankAccount!: string;
}

// ==================== MANAGEMENT AGREEMENT DTOs ====================

export class CompanyAgreementResponse {
    id!: number;
    companyId!: number;
    amount!: number;
    signedAt?: Date;
    contractId?: number;
    createdAt!: Date;
    updatedAt!: Date;
    status!: 'UNSIGNED' | 'SIGNED';
}

export class SignAgreementRequest {
    @IsNotEmpty({ message: 'Agreement ID is required' })
    @IsInt()
    agreementId!: number;

    @IsOptional()
    @IsString()
    signatureData?: string; // Base64 encoded signature
}

export class AgreementDownloadResponse {
    contractId!: number;
    fileName!: string;
    contentType!: string;
    data!: Buffer; // Binary PDF data
    createdAt!: Date;
}

// ==================== LINKED LENDERS DTOs ====================

export class CompanyLenderResponse {
    id!: number;
    companyId!: number;
    lenderId!: number;
    lenderName!: string;
    lenderEmail!: string;
    amountLimit!: number;
    active!: boolean;
    createdAt!: Date;
    updatedAt!: Date;
}

export class LinkLenderRequest {
    @IsNotEmpty({ message: 'Lender ID is required' })
    @IsInt()
    lenderId!: number;

    @IsNotEmpty({ message: 'Amount limit is required' })
    @IsDecimal({ decimal_digits: '1,2' })
    amountLimit!: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

export class UpdateLenderRequest {
    @IsOptional()
    @IsDecimal({ decimal_digits: '1,2' })
    amountLimit?: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

export class ToggleLenderStatusRequest {
    @IsNotEmpty({ message: 'Active status is required' })
    @IsBoolean()
    active!: boolean;
}

// ==================== AUTOMATION RULES DTOs ====================

export class AutomationRuleResponse {
    id!: number;
    companyId!: number;
    minLevel!: number;
    maxAmount!: number;
    active!: boolean;
    priority!: number;
    createdAt!: Date;
    updatedAt!: Date;
}

export class CreateAutomationRuleRequest {
    @IsNotEmpty({ message: 'Minimum level is required' })
    @IsInt()
    @Min(0)
    minLevel!: number;

    @IsNotEmpty({ message: 'Maximum amount is required' })
    @IsDecimal({ decimal_digits: '1,2' })
    @Min(0)
    maxAmount!: number;

    @IsOptional()
    @IsInt()
    priority?: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

export class UpdateAutomationRuleRequest {
    @IsOptional()
    @IsInt()
    @Min(0)
    minLevel?: number;

    @IsOptional()
    @IsDecimal({ decimal_digits: '1,2' })
    @Min(0)
    maxAmount?: number;

    @IsOptional()
    @IsInt()
    priority?: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

// ==================== MANAGED LOANS DTOs ====================

export class ManagedLoanResponse {
    id!: number;
    borrowerId!: number;
    borrowerEmail!: string; // Only this PII exposed
    borrowerName!: string; // First name only
    loanAmount!: number;
    outstandingBalance!: number;
    status!: string;
    statusId!: number;
    createdAt!: Date;
    nextPaymentDueDate?: Date;
    repaymentDetails!: RepaymentDetailDto[];
}

export class RepaymentDetailDto {
    id!: number;
    dueDate!: Date;
    amount!: number;
    status!: string; // PENDING, PAID, OVERDUE
    paidDate?: Date;
}

export class ManagedLoansListResponse {
    data!: ManagedLoanResponse[];
    pagination!: {
        page: number;
        pageSize: number;
        total: number;
        pages: number;
    };
}

export class ManagedLoanDetailResponse extends ManagedLoanResponse {
    contractTerms!: string;
    interestRate!: number;
    totalRepayments!: number;
    paidRepayments!: number;
    overdueRepayments!: number;
}

// ==================== BULK ACTIONS DTOs ====================

export class BulkRemindersRequest {
    @IsArray()
    @IsInt({ each: true })
    @IsNotEmpty({ message: 'Loan IDs are required' })
    loanIds!: number[];

    @IsNotEmpty({ message: 'Reminder message is required' })
    @IsString()
    message!: string;

    @IsOptional()
    @IsString()
    reminderType?: string; // EMAIL, SMS, PUSH
}

export class BulkRemindersResponse {
    reminderCount!: number;
    insertedAt!: Date;
    exportId?: number;
}

export class BulkCsvExportRequest {
    @IsArray()
    @IsInt({ each: true })
    @IsNotEmpty({ message: 'Loan IDs are required' })
    loanIds!: number[];

    @IsOptional()
    @IsString()
    fileName?: string;
}

export class BulkXmlExportRequest {
    @IsArray()
    @IsInt({ each: true })
    @IsNotEmpty({ message: 'Loan IDs are required' })
    loanIds!: number[];

    // ENFORCED: loanIds.length must be <= 500
}

export class BulkClaimsRequest {
    @IsArray()
    @IsInt({ each: true })
    @IsNotEmpty({ message: 'Loan IDs are required' })
    loanIds!: number[];

    @IsNotEmpty({ message: 'Claim reason is required' })
    @IsString()
    reason!: string;

    @IsOptional()
    @IsString()
    claimType?: string;
}

export class BulkActionResponse {
    exportId!: number;
    type!: string;
    itemCount!: number;
    status!: string; // PENDING, COMPLETED
    downloadUrl?: string;
    createdAt!: Date;
}

// ==================== DOCUMENT CENTER DTOs ====================

export class DocumentListItem {
    id!: number;
    type!: string; // CONTRACT, EXPORT, CLAIM, REMINDER
    name!: string;
    fileSize?: number;
    createdAt!: Date;
    metadata?: any;
}

export class DocumentListResponse {
    documents!: DocumentListItem[];
    pagination!: {
        page: number;
        pageSize: number;
        total: number;
        pages: number;
    };
}

export class DocumentDownloadResponse {
    id!: number;
    fileName!: string;
    contentType!: string;
    data!: Buffer;
    createdAt!: Date;
}

// ==================== NOTIFICATIONS DTOs ====================

export class CompanyNotificationResponse {
    id!: number;
    type!: string;
    title!: string;
    message!: string;
    payload?: any;
    read!: boolean;
    createdAt!: Date;
}

export class NotificationsListResponse {
    notifications!: CompanyNotificationResponse[];
    unreadCount!: number;
    pagination!: {
        page: number;
        pageSize: number;
        total: number;
        pages: number;
    };
}

export class MarkNotificationReadRequest {
    @IsNotEmpty({ message: 'Notification ID is required' })
    @IsInt()
    notificationId!: number;
}

// ==================== PAGINATION DTO ====================

export class CompanyPaginationQuery {
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number; // Default: 1

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number; // Default: 20, Max: 100

    @IsOptional()
    @IsString()
    sortBy?: string; // Field name for sorting

    @IsOptional()
    @IsEnum(['ASC', 'DESC'])
    sortOrder?: 'ASC' | 'DESC'; // Default: DESC
}

// ==================== ERROR RESPONSES ====================

export class CompanyErrorResponse {
    statusCode!: string;
    statusMessage!: string;
    detail?: string;
    errors?: Record<string, string[]>;
    timestamp!: Date;
}

export class OperationalLockError extends CompanyErrorResponse {
    statusCode = '423';
    statusMessage = 'Operational Lock';
    detail = 'Management agreement not signed. Company cannot perform write operations.';
}

export class CompanyNotApprovedError extends CompanyErrorResponse {
    statusCode = '423';
    statusMessage = 'Company Not Approved';
    detail = 'Company must be in APPROVED status to access this resource.';
}

export class ExportLimitExceededError extends CompanyErrorResponse {
    statusCode = '400';
    statusMessage = 'Export Limit Exceeded';
    detail = 'XML exports are limited to 500 loans per request.';
}

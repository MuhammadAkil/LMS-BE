/**
 * LENDER MODULE DTOs
 * Request/Response objects for all lender operations
 */

// ============================================
// L-01: DASHBOARD
// ============================================

export interface LenderDashboardStatsResponse {
    activeInvestments: number;
    totalInvestedAmount: number;
    managedAmount: number;
    selfInvestedAmount: number;
    expectedRepayments: number;
    overdueLoanCount: number;
    avgRepaymentRate: number;
    nextRepaymentDate: string | null;
}

export interface LenderAlertDto {
    id: string;
    type: 'OVERDUE_REPAYMENT' | 'PENDING_ACTION' | 'AUTOMATION_ISSUE';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
    entityType: string; // 'LOAN', 'REPAYMENT', 'AGREEMENT'
    entityId: string;
    createdAt: string;
    resolvedAt: string | null;
}

export interface LenderDashboardAlertsResponse {
    alerts: LenderAlertDto[];
    totalCount: number;
    unreadCount: number;
}

// ============================================
// L-02: BROWSE LOANS
// ============================================

export interface LoanBrowseFilterDto {
    status?: string; // OPEN, FUNDED, CLOSED, CANCELLED
    minAmount?: number;
    maxAmount?: number;
    minDuration?: number;
    maxDuration?: number;
    sortBy?: 'created_at' | 'amount' | 'duration_months';
    sortOrder?: 'ASC' | 'DESC';
    page?: number;
    pageSize?: number;
}

export interface LoanOfferDto {
    lenderId: string;
    amount: number;
    createdAt: string;
}

export interface LoanBrowseItemDto {
    id: string;
    borrowerId: string;
    amount: number;
    durationMonths: number;
    purpose: string;
    statusCode: string;
    statusName: string;
    createdAt: string;
    fundedPercent: number;
    remainingAmount: number;
    offers: LoanOfferDto[];
    ctaEligible: boolean; // Can current user make offer
    ctaReason?: string; // If not eligible, why
}

export interface LoanBrowsePageResponse {
    items: LoanBrowseItemDto[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    };
}

export interface LoanDetailResponse extends LoanBrowseItemDto {
    borrowerName: string;
    borrowerLevel: number;
    borrowerVerificationStatus: string;
    totalOffers: number;
    fundedByOthers: number;
}

// ============================================
// L-03: MAKE OFFER (CRITICAL)
// ============================================

export interface MakeOfferRequest {
    loanId: string;
    amount: number;
}

export interface MakeOfferResponse {
    offerId: string;
    loanId: string;
    lenderId: string;
    amount: number;
    loanFundedPercent: number;
    createdAt: string;
    message: string;
}

export interface OfferValidationResponse {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    lenderBalance?: number;
    remainingCapacity?: number;
    estimatedROI?: number;
}

// ============================================
// L-04: MY INVESTMENTS
// ============================================

export interface RepaymentDto {
    id: string;
    dueDate: string;
    amount: number;
    paidAmount?: number;
    paidAt?: string;
    status: 'PENDING' | 'PAID' | 'OVERDUE';
    daysOverdue?: number;
}

export interface LenderInvestmentDto {
    investmentId: string;
    loanId: string;
    borrowerId: string;
    borrowerName: string;
    offerId: string;
    investedAmount: number;
    investedAt: string;
    totalLoanAmount: number;
    yourShare: number;
    loanStatus: string;
    loanDueDate: string;
    nextRepaymentDate: string | null;
    repaymentStatus: 'ON_TRACK' | 'OVERDUE' | 'COMPLETED';
    contractPdfUrl: string | null;
}

export interface LenderInvestmentsPageResponse {
    items: LenderInvestmentDto[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    };
    summary: {
        totalInvested: number;
        activeCount: number;
        completedCount: number;
        overdueCount: number;
    };
}

export interface LenderInvestmentDetailResponse extends LenderInvestmentDto {
    repayments: RepaymentDto[];
    estimatedROI: number;
    actualROI?: number;
}

// ============================================
// L-05: REMINDERS
// ============================================

export interface SendReminderRequest {
    loanId: string;
    templateCode?: string; // e.g., PAYMENT_REMINDER
}

export interface SendReminderResponse {
    reminderId: string;
    loanId: string;
    sentAt: string;
    channel: 'EMAIL' | 'SMS' | 'IN_APP';
    message: string;
}

// ============================================
// L-06: EXPORTS & CLAIMS
// ============================================

export interface ExportCsvRequest {
    dateFrom?: string;
    dateTo?: string;
    statusFilter?: string[];
    format?: 'CSV';
}

export interface ExportXmlRequest {
    dateFrom?: string;
    dateTo?: string;
    statusFilter?: string[];
    limit?: number; // Max 500 for XML
}

export interface ExportDto {
    id: string;
    exportTypeCode: string;
    createdBy: string;
    filePath: string;
    createdAt: string;
    itemCount: number;
    fileSize: number;
}

export interface ExportHistoryResponse {
    exports: ExportDto[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    };
}

export interface GenerateClaimRequest {
    loanId: string;
    reason: string; // PAYMENT_DEFAULT, MISSING_DOCUMENTATION, etc.
}

export interface GenerateClaimResponse {
    claimId: string;
    loanId: string;
    xmlPath: string;
    generatedAt: string;
    message: string;
}

// ============================================
// L-07: MANAGEMENT AGREEMENTS
// ============================================

export interface ManagementCompanyDto {
    id: string;
    name: string;
    bankAccount: string;
    statusCode: string;
    statusName: string;
    approvedAt: string | null;
    conditions?: any; // JSON from DB
}

export interface ManagementCompaniesResponse {
    companies: ManagementCompanyDto[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    };
}

export interface CreateManagementAgreementRequest {
    companyId: string;
    amount: number;
}

export interface ManagementAgreementDto {
    id: string;
    lenderId: string;
    companyId: string;
    companyName: string;
    amount: number;
    signedAt: string;
    pdfPath: string;
    status: 'ACTIVE' | 'TERMINATED' | 'SUSPENDED';
}

export interface ManagementAgreementsResponse {
    agreements: ManagementAgreementDto[];
    pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
    };
}

// ============================================
// L-08: VERIFICATION CENTER
// ============================================

export interface VerificationListResponse {
    verifications: {
        id: string;
        typeCode: string;
        typeName: string;
        statusCode: string;
        statusName: string;
        reviewedBy?: string;
        reviewedAt?: string;
        createdAt: string;
        documents?: {
            id: string;
            filePath: string;
            uploadedAt: string;
        }[];
    }[];
    requiredVerifications: string[];
    currentLevel: number;
    nextLevelRequires: string[];
}

export interface SubmitVerificationRequest {
    verificationType: string; // KYC, BANK, INCOME, BUSINESS, etc.
    documents: {
        fileName: string;
        filePath: string;
    }[];
}

export interface SubmitVerificationResponse {
    verificationId: string;
    typeCode: string;
    statusCode: string;
    message: string;
    createdAt: string;
}

// ============================================
// L-09: PROFILE
// ============================================

export interface LenderProfileDto {
    id: string;
    email: string;
    phone?: string;
    level: number;
    statusCode: string;
    statusName: string;
    createdAt: string;
    updatedAt: string;
    verificationStatus: {
        level: number;
        completedTypes: string[];
        pendingTypes: string[];
    };
    bankAccount?: {
        isVerified: boolean;
        lastVerifiedAt?: string;
    };
}

export interface UpdateLenderProfileRequest {
    phone?: string;
    // Limited editable fields only
    // Email, password, role cannot be edited here
}

export interface UpdateLenderProfileResponse {
    profile: LenderProfileDto;
    updatedFields: string[];
    message: string;
}

// ============================================
// SHARED RESPONSE WRAPPER
// ============================================

export interface LenderApiResponse<T> {
    statusCode: string;
    statusMessage: string;
    data?: T;
    errors?: string[];
    timestamp: string;
}

export interface PaginationParams {
    page?: number;
    pageSize?: number;
}

/**
 * Standard error response for validation
 */
export interface ValidationErrorResponse {
    statusCode: string;
    statusMessage: string;
    errors: {
        field: string;
        message: string;
    }[];
    timestamp: string;
}

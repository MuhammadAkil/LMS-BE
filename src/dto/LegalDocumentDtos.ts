/**
 * Legal / compliance document DTOs
 * Admin: CRUD document types, versions, assignments, acceptance logs
 * User: pending documents, accept
 */

export type LegalDocumentTypeCode = 'LOAN_AGREEMENT' | 'PRIVACY_POLICY' | 'GDPR_CONSENT' | 'CUSTOM';
export type LegalDocumentUserType = 'BORROWER' | 'LENDER' | 'COMPANY';

export interface LegalDocumentDto {
    id: number;
    name: string;
    typeCode: LegalDocumentTypeCode | string;
    createdAt: string;
    updatedAt: string;
}

export interface LegalDocumentVersionDto {
    id: number;
    documentId: number;
    versionNumber: number;
    content: string | null;
    filePath: string | null;
    effectiveFrom: string;
    createdAt: string;
}

export interface LegalDocumentAssignmentDto {
    id: number;
    documentId: number;
    userType: LegalDocumentUserType;
    mandatory: boolean;
    createdAt: string;
}

export interface LegalDocumentAcceptanceLogDto {
    id: number;
    userId: number;
    userEmail?: string;
    userName?: string;
    documentId: number;
    documentName: string;
    versionId: number;
    versionNumber: number;
    acceptedAt: string;
    ipAddress: string | null;
}

// --- Admin requests ---
export interface CreateLegalDocumentRequest {
    name: string;
    typeCode: LegalDocumentTypeCode | string;
}

export interface UpdateLegalDocumentRequest {
    name?: string;
    typeCode?: LegalDocumentTypeCode | string;
}

export interface CreateLegalDocumentVersionRequest {
    content?: string | null;
    filePath?: string | null;
    effectiveFrom: string; // ISO date
}

export interface SetLegalDocumentAssignmentRequest {
    userType: LegalDocumentUserType;
    mandatory: boolean;
}

export interface SetLegalDocumentAssignmentsRequest {
    assignments: SetLegalDocumentAssignmentRequest[]; // one per user type to assign
}

// --- User-facing ---
export interface PendingLegalDocumentDto {
    documentId: number;
    documentName: string;
    typeCode: string;
    versionId: number;
    versionNumber: number;
    content: string | null;
    filePath: string | null;
    effectiveFrom: string;
    mandatory: boolean;
}

export interface AcceptLegalDocumentRequest {
    documentVersionId: number;
}

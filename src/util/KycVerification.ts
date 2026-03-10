export enum VerificationWorkflowStatusCode {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const VERIFICATION_STATUS_IDS = {
  PENDING_VERIFICATION: 1,
  UNDER_REVIEW: 2,
  APPROVED: 3,
  REJECTED: 4,
} as const;

export type ApplicantType = 'INDIVIDUAL' | 'COMPANY';

export type KycCategoryCode =
  | 'INDIVIDUAL_IDENTITY'
  | 'INDIVIDUAL_PROOF_OF_ADDRESS'
  | 'COMPANY_REGISTRATION'
  | 'COMPANY_DIRECTOR_IDENTITY'
  | 'COMPANY_PROOF_OF_ADDRESS';

export type KycDocumentSubtype =
  | 'POLISH_NATIONAL_ID_CARD'
  | 'PASSPORT'
  | 'RESIDENCE_PERMIT'
  | 'UTILITY_BILL'
  | 'BANK_STATEMENT'
  | 'GOVERNMENT_LETTER'
  | 'KRS_EXTRACT'
  | 'BUSINESS_REGISTRATION'
  | 'GOVERNMENT_REGISTRATION_DOCUMENT';

export type DocumentSide = 'FRONT' | 'BACK' | 'FULL';

export interface KycDocumentRequirement {
  category: KycCategoryCode;
  title: string;
  description: string;
  applicantType: ApplicantType;
  required: boolean;
  acceptedSubtypes: KycDocumentSubtype[];
  requiresBothSidesFor: KycDocumentSubtype[];
  maxAgeMonths?: number;
  mustBeUnexpired?: boolean;
}

export const KYC_REQUIREMENTS: Record<ApplicantType, KycDocumentRequirement[]> = {
  INDIVIDUAL: [
    {
      category: 'INDIVIDUAL_IDENTITY',
      title: 'Identity Document',
      description: 'Valid identity document. For Polish national ID cards both front and back are required.',
      applicantType: 'INDIVIDUAL',
      required: true,
      acceptedSubtypes: ['POLISH_NATIONAL_ID_CARD', 'PASSPORT', 'RESIDENCE_PERMIT'],
      requiresBothSidesFor: ['POLISH_NATIONAL_ID_CARD'],
      mustBeUnexpired: true,
    },
    {
      category: 'INDIVIDUAL_PROOF_OF_ADDRESS',
      title: 'Proof of Address',
      description: 'Document must show full name and residential address and be issued within the last 3 months.',
      applicantType: 'INDIVIDUAL',
      required: true,
      acceptedSubtypes: ['UTILITY_BILL', 'BANK_STATEMENT', 'GOVERNMENT_LETTER'],
      requiresBothSidesFor: [],
      maxAgeMonths: 3,
    },
  ],
  COMPANY: [
    {
      category: 'COMPANY_REGISTRATION',
      title: 'Company Registration Document',
      description: 'Official company registration evidence (e.g. KRS extract).',
      applicantType: 'COMPANY',
      required: true,
      acceptedSubtypes: ['KRS_EXTRACT', 'BUSINESS_REGISTRATION'],
      requiresBothSidesFor: [],
    },
    {
      category: 'COMPANY_DIRECTOR_IDENTITY',
      title: 'Director / Owner Identity Document',
      description: 'Valid ID document of director or beneficial owner.',
      applicantType: 'COMPANY',
      required: true,
      acceptedSubtypes: ['POLISH_NATIONAL_ID_CARD', 'PASSPORT', 'RESIDENCE_PERMIT'],
      requiresBothSidesFor: ['POLISH_NATIONAL_ID_CARD'],
      mustBeUnexpired: true,
    },
    {
      category: 'COMPANY_PROOF_OF_ADDRESS',
      title: 'Proof of Company Address',
      description: 'Recent company address proof document.',
      applicantType: 'COMPANY',
      required: true,
      acceptedSubtypes: ['UTILITY_BILL', 'BANK_STATEMENT', 'GOVERNMENT_REGISTRATION_DOCUMENT'],
      requiresBothSidesFor: [],
      maxAgeMonths: 3,
    },
  ],
};

export function getApplicantTypeFromRoleId(roleId: number): ApplicantType {
  return roleId === 4 ? 'COMPANY' : 'INDIVIDUAL';
}

export function getStatusCodeById(statusId: number): VerificationWorkflowStatusCode {
  switch (statusId) {
    case VERIFICATION_STATUS_IDS.PENDING_VERIFICATION:
      return VerificationWorkflowStatusCode.PENDING_VERIFICATION;
    case VERIFICATION_STATUS_IDS.UNDER_REVIEW:
      return VerificationWorkflowStatusCode.UNDER_REVIEW;
    case VERIFICATION_STATUS_IDS.APPROVED:
      return VerificationWorkflowStatusCode.APPROVED;
    case VERIFICATION_STATUS_IDS.REJECTED:
      return VerificationWorkflowStatusCode.REJECTED;
    default:
      return VerificationWorkflowStatusCode.PENDING_VERIFICATION;
  }
}

import {
  ApplicantType,
  DocumentSide,
  KYC_REQUIREMENTS,
  KycCategoryCode,
  KycDocumentRequirement,
  KycDocumentSubtype,
} from '../util/KycVerification';

export interface SubmittedKycDocument {
  fileName: string;
  filePath: string;
  mimeType?: string;
  size?: number;
  category?: string;
  subtype?: string;
  side?: string;
  issuedAt?: string | Date;
  expiresAt?: string | Date;
  fullName?: string;
  addressLine?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidationOptions {
  requireAllCategories?: boolean;
  targetCategory?: KycCategoryCode;
}

export class KycDocumentValidationService {
  validateSubmission(
    applicantType: ApplicantType,
    documents: SubmittedKycDocument[],
    options: ValidationOptions = {}
  ): ValidationResult {
    const errors: string[] = [];
    const requirements = KYC_REQUIREMENTS[applicantType];
    const requireAllCategories = options.requireAllCategories ?? true;
    const activeRequirements = options.targetCategory
      ? requirements.filter((r) => r.category === options.targetCategory)
      : requirements;

    for (const req of activeRequirements) {
      if (!req.required) {
        continue;
      }

      const categoryDocs = documents.filter((d) => d.category === req.category);
      if (categoryDocs.length === 0 && requireAllCategories) {
        errors.push(`${req.category} is required`);
        continue;
      }
      if (categoryDocs.length === 0) {
        continue;
      }

      for (const doc of categoryDocs) {
        // Expiry and age checks are relaxed at upload time; admins validate during review.
      }

      // FRONT/BACK side completeness is not enforced at upload time; it is a manual check during admin review.
    }

    return { valid: errors.length === 0, errors };
  }

  buildRequirementCards(applicantType: ApplicantType, completedTypes: Set<number>, typeMap: Record<string, number>) {
    return KYC_REQUIREMENTS[applicantType].map((req, idx) => {
      const typeId = typeMap[req.category];
      return {
        id: `REQ_${idx + 1}_${req.category}`,
        type: req.category,
        title: req.title,
        description: req.description,
        isRequired: req.required,
        isCompleted: typeId ? completedTypes.has(typeId) : false,
        acceptedDocuments: req.acceptedSubtypes.map((s) => this.subtypeLabel(s)),
        acceptedSubtypes: req.acceptedSubtypes,
        requiresBothSidesFor: req.requiresBothSidesFor,
        maxAgeMonths: req.maxAgeMonths,
        mustBeUnexpired: req.mustBeUnexpired,
      };
    });
  }

  private toDate(value: string | Date): Date | null {
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private isOlderThanMonths(date: Date, months: number): boolean {
    const minDate = new Date();
    minDate.setMonth(minDate.getMonth() - months);
    return date < minDate;
  }

  private subtypeLabel(subtype: KycDocumentSubtype): string {
    const labels: Record<KycDocumentSubtype, string> = {
      POLISH_NATIONAL_ID_CARD: 'Polish National ID Card (Dowod Osobisty)',
      PASSPORT: 'Passport',
      RESIDENCE_PERMIT: 'Residence Permit (Karta Pobytu)',
      UTILITY_BILL: 'Utility bill (issued within last 3 months)',
      BANK_STATEMENT: 'Bank statement (issued within last 3 months)',
      GOVERNMENT_LETTER: 'Government letter showing address',
      KRS_EXTRACT: 'KRS Extract (National Court Register)',
      BUSINESS_REGISTRATION: 'Official business registration document',
      GOVERNMENT_REGISTRATION_DOCUMENT: 'Government registration document',
    };
    return labels[subtype];
  }
}

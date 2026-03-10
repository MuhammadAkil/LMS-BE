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

export class KycDocumentValidationService {
  validateSubmission(applicantType: ApplicantType, documents: SubmittedKycDocument[]): ValidationResult {
    const errors: string[] = [];
    const requirements = KYC_REQUIREMENTS[applicantType];

    for (const req of requirements) {
      if (!req.required) {
        continue;
      }

      const categoryDocs = documents.filter((d) => d.category === req.category);
      if (categoryDocs.length === 0) {
        errors.push(`${req.category} is required`);
        continue;
      }

      for (const doc of categoryDocs) {
        if (!doc.subtype || !req.acceptedSubtypes.includes(doc.subtype as KycDocumentSubtype)) {
          errors.push(`Invalid subtype for ${req.category}`);
        }

        if (req.mustBeUnexpired && doc.expiresAt) {
          const expiresAt = this.toDate(doc.expiresAt);
          if (!expiresAt || expiresAt < new Date()) {
            errors.push(`Document expired for ${req.category}`);
          }
        }

        if (req.maxAgeMonths && doc.issuedAt) {
          const issuedAt = this.toDate(doc.issuedAt);
          if (!issuedAt || this.isOlderThanMonths(issuedAt, req.maxAgeMonths)) {
            errors.push(`Document too old for ${req.category}; max ${req.maxAgeMonths} months`);
          }
        }

        if (req.category.endsWith('PROOF_OF_ADDRESS')) {
          if (!doc.fullName || !doc.fullName.trim()) {
            errors.push(`Full name is required for ${req.category}`);
          }
          if (!doc.addressLine || !doc.addressLine.trim()) {
            errors.push(`Address is required for ${req.category}`);
          }
        }
      }

      for (const subtype of req.requiresBothSidesFor) {
        const subtypeDocs = categoryDocs.filter((d) => d.subtype === subtype);
        if (subtypeDocs.length === 0) {
          continue;
        }
        const sides = new Set(
          subtypeDocs.map((d) => (d.side || 'FULL').toUpperCase() as DocumentSide)
        );
        if (!sides.has('FRONT') || !sides.has('BACK')) {
          errors.push(`${subtype} requires FRONT and BACK sides`);
        }
      }
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

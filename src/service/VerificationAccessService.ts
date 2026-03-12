import { VerificationRepositoryBase } from '../repository/VerificationRepositoryBase';
import { KYC_REQUIREMENTS, getApplicantTypeFromRoleId, KycCategoryCode } from '../util/KycVerification';

const TYPE_ID_BY_CATEGORY: Record<KycCategoryCode, number> = {
  INDIVIDUAL_IDENTITY: 1,
  INDIVIDUAL_PROOF_OF_ADDRESS: 2,
  COMPANY_REGISTRATION: 7,
  COMPANY_DIRECTOR_IDENTITY: 8,
  COMPANY_PROOF_OF_ADDRESS: 9,
};

/**
 * Centralized policy:
 * User can access operational role endpoints only when all required KYC docs
 * for their role are approved by admin.
 */
export class VerificationAccessService {
  private verificationRepo: VerificationRepositoryBase;

  constructor() {
    this.verificationRepo = new VerificationRepositoryBase();
  }

  isVerificationBypassPath(path: string): boolean {
    const p = String(path || '');
    return (
      p.includes('/borrower/verification') ||
      p.includes('/lender/verifications') ||
      p.includes('/company/verification') ||
      p.includes('/borrower/profile') ||
      p.includes('/lender/profile') ||
      p.includes('/company/profile')
    );
  }

  async getVerificationGate(userId: number, roleId: number): Promise<{ isVerified: boolean; missingCategories: string[] }> {
    const applicantType = getApplicantTypeFromRoleId(roleId);
    const required = KYC_REQUIREMENTS[applicantType]
      .filter((r) => r.required)
      .map((r) => r.category);

    const verifications = await this.verificationRepo.findByUserId(userId);

    // Track latest status per typeId (latest submission wins)
    const latestByType = new Map<number, { statusId: number; submittedAtTs: number }>();
    for (const v of verifications) {
      const ts = v.submittedAt ? new Date(v.submittedAt).getTime() : 0;
      const current = latestByType.get(v.typeId);
      if (!current || ts >= current.submittedAtTs) {
        latestByType.set(v.typeId, { statusId: v.statusId, submittedAtTs: ts });
      }
    }

    const missingCategories = required.filter((category) => {
      const typeId = TYPE_ID_BY_CATEGORY[category];
      const latest = latestByType.get(typeId);
      // approved statusId = 3
      return !latest || latest.statusId !== 3;
    });

    return {
      isVerified: missingCategories.length === 0,
      missingCategories,
    };
  }
}


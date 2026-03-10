import { KycDocumentValidationService } from '../../../service/KycDocumentValidationService';

describe('KycDocumentValidationService', () => {
  const service = new KycDocumentValidationService();

  it('accepts valid individual identity with both sides', () => {
    const result = service.validateSubmission('INDIVIDUAL', [
      {
        fileName: 'id-front.jpg',
        filePath: '/uploads/kyc/id-front.jpg',
        category: 'INDIVIDUAL_IDENTITY',
        subtype: 'POLISH_NATIONAL_ID_CARD',
        side: 'FRONT',
        expiresAt: '2099-01-01',
      },
      {
        fileName: 'id-back.jpg',
        filePath: '/uploads/kyc/id-back.jpg',
        category: 'INDIVIDUAL_IDENTITY',
        subtype: 'POLISH_NATIONAL_ID_CARD',
        side: 'BACK',
        expiresAt: '2099-01-01',
      },
      {
        fileName: 'address.pdf',
        filePath: '/uploads/kyc/address.pdf',
        category: 'INDIVIDUAL_PROOF_OF_ADDRESS',
        subtype: 'UTILITY_BILL',
        issuedAt: new Date().toISOString(),
        fullName: 'Jan Kowalski',
        addressLine: 'Warsaw, Poland',
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects expired identity document', () => {
    const result = service.validateSubmission('INDIVIDUAL', [
      {
        fileName: 'passport.jpg',
        filePath: '/uploads/kyc/passport.jpg',
        category: 'INDIVIDUAL_IDENTITY',
        subtype: 'PASSPORT',
        side: 'FULL',
        expiresAt: '2020-01-01',
      },
      {
        fileName: 'address.pdf',
        filePath: '/uploads/kyc/address.pdf',
        category: 'INDIVIDUAL_PROOF_OF_ADDRESS',
        subtype: 'BANK_STATEMENT',
        issuedAt: new Date().toISOString(),
        fullName: 'Jan Kowalski',
        addressLine: 'Krakow, Poland',
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Document expired');
  });

  it('rejects proof of address older than 3 months', () => {
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 4);

    const result = service.validateSubmission('INDIVIDUAL', [
      {
        fileName: 'passport.jpg',
        filePath: '/uploads/kyc/passport.jpg',
        category: 'INDIVIDUAL_IDENTITY',
        subtype: 'PASSPORT',
        side: 'FULL',
        expiresAt: '2099-01-01',
      },
      {
        fileName: 'address.pdf',
        filePath: '/uploads/kyc/address.pdf',
        category: 'INDIVIDUAL_PROOF_OF_ADDRESS',
        subtype: 'BANK_STATEMENT',
        issuedAt: oldDate.toISOString(),
        fullName: 'Jan Kowalski',
        addressLine: 'Wroclaw, Poland',
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Document too old');
  });

  it('rejects company submission with missing required categories', () => {
    const result = service.validateSubmission('COMPANY', [
      {
        fileName: 'krs.pdf',
        filePath: '/uploads/kyc/krs.pdf',
        category: 'COMPANY_REGISTRATION',
        subtype: 'KRS_EXTRACT',
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('COMPANY_DIRECTOR_IDENTITY is required');
    expect(result.errors.join(' ')).toContain('COMPANY_PROOF_OF_ADDRESS is required');
  });
});

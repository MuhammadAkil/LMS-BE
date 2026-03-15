-- Bilateral signing: party signing info and signed document path
-- Both lender and company can enter name, role, date, signature and sign from the platform.

ALTER TABLE management_agreements
  ADD COLUMN lender_signed_at DATETIME NULL AFTER signedAt,
  ADD COLUMN lender_signer_name VARCHAR(255) NULL AFTER lender_signed_at,
  ADD COLUMN lender_signer_role VARCHAR(100) NULL AFTER lender_signer_name,
  ADD COLUMN lender_signature_data TEXT NULL AFTER lender_signer_role,
  ADD COLUMN company_signed_at DATETIME NULL AFTER lender_signature_data,
  ADD COLUMN company_signer_name VARCHAR(255) NULL AFTER company_signed_at,
  ADD COLUMN company_signer_role VARCHAR(100) NULL AFTER company_signer_name,
  ADD COLUMN company_signature_data TEXT NULL AFTER company_signer_role,
  ADD COLUMN signed_document_path VARCHAR(500) NULL AFTER company_signature_data;

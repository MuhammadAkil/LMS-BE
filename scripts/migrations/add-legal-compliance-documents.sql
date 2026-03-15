-- Legal / compliance documents: types, versions, assignments, acceptances
-- Admin can create document types, assign to BORROWER/LENDER/COMPANY, set mandatory, version documents; users accept and are blocked until mandatory accepted.

CREATE TABLE IF NOT EXISTS legal_documents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL COMMENT 'Display label',
  type_code VARCHAR(64) NOT NULL COMMENT 'LOAN_AGREEMENT, PRIVACY_POLICY, GDPR_CONSENT, CUSTOM',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS legal_document_versions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  content TEXT NULL,
  file_path VARCHAR(512) NULL,
  effective_from DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_legal_doc_versions_document_id (document_id),
  CONSTRAINT fk_legal_doc_versions_document FOREIGN KEY (document_id) REFERENCES legal_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS legal_document_assignments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  user_type VARCHAR(32) NOT NULL COMMENT 'BORROWER, LENDER, COMPANY',
  mandatory TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_legal_doc_assignment_doc_user (document_id, user_type),
  INDEX idx_legal_doc_assignments_document_id (document_id),
  CONSTRAINT fk_legal_doc_assignments_document FOREIGN KEY (document_id) REFERENCES legal_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS legal_document_acceptances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  document_version_id INT UNSIGNED NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL,
  UNIQUE KEY uq_legal_doc_acceptance_user_version (user_id, document_version_id),
  INDEX idx_legal_doc_acceptances_user_id (user_id),
  INDEX idx_legal_doc_acceptances_version_id (document_version_id),
  CONSTRAINT fk_legal_doc_acceptances_version FOREIGN KEY (document_version_id) REFERENCES legal_document_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

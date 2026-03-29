-- Loan disbursement records (off-platform manual bank transfer).
-- Sender is either lender (direct) or company (on behalf of lender).
CREATE TABLE IF NOT EXISTS loan_disbursements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_id BIGINT UNSIGNED NOT NULL,
  sender_type VARCHAR(20) NOT NULL COMMENT 'LENDER | COMPANY',
  amount DECIMAL(10,2) NOT NULL,
  transfer_date DATE NOT NULL,
  reference_number VARCHAR(255) NULL,
  confirmed_by_lender_id BIGINT UNSIGNED NULL COMMENT 'Set when sender_type = LENDER',
  confirmed_by_company_id BIGINT UNSIGNED NULL COMMENT 'Set when sender_type = COMPANY',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_loan_disbursements_loan_id (loan_id),
  INDEX idx_loan_disbursements_sender (sender_type),
  CONSTRAINT fk_loan_disbursements_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  CONSTRAINT fk_loan_disbursements_lender FOREIGN KEY (confirmed_by_lender_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_loan_disbursements_company FOREIGN KEY (confirmed_by_company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

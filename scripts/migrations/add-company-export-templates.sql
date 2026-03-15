-- Company XML export templates (per company, reusable field selection)
CREATE TABLE IF NOT EXISTS company_export_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  field_keys JSON NOT NULL COMMENT 'Array of field keys e.g. ["loanId","loanAmount","status"]',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_company_export_templates_company_id (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

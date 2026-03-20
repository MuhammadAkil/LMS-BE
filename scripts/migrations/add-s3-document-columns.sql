-- Add S3 reference columns while keeping legacy blob/path columns for backward compatibility.
-- Legacy columns must remain until backfill + verification is complete.

DROP PROCEDURE IF EXISTS add_s3_columns_if_needed;
DELIMITER //
CREATE PROCEDURE add_s3_columns_if_needed(IN table_name_in VARCHAR(128))
BEGIN
  DECLARE table_exists_count INT DEFAULT 0;
  DECLARE has_document_key INT DEFAULT 0;
  DECLARE has_document_url INT DEFAULT 0;

  SELECT COUNT(*)
  INTO table_exists_count
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = table_name_in;

  IF table_exists_count > 0 THEN
    SELECT COUNT(*)
    INTO has_document_key
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_in
      AND COLUMN_NAME = 'document_key';

    IF has_document_key = 0 THEN
      SET @sql_doc_key = CONCAT(
        'ALTER TABLE `', table_name_in, '` ',
        'ADD COLUMN `document_key` VARCHAR(500) NULL ',
        'COMMENT ''S3 object key (legacy blob/path columns are deprecated)'''
      );
      PREPARE stmt_doc_key FROM @sql_doc_key;
      EXECUTE stmt_doc_key;
      DEALLOCATE PREPARE stmt_doc_key;
    END IF;

    SELECT COUNT(*)
    INTO has_document_url
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_in
      AND COLUMN_NAME = 'document_url';

    IF has_document_url = 0 THEN
      SET @sql_doc_url = CONCAT(
        'ALTER TABLE `', table_name_in, '` ',
        'ADD COLUMN `document_url` VARCHAR(1000) NULL ',
        'COMMENT ''Optional cached URL; prefer presigned URL generation on demand'''
      );
      PREPARE stmt_doc_url FROM @sql_doc_url;
      EXECUTE stmt_doc_url;
      DEALLOCATE PREPARE stmt_doc_url;
    END IF;
  END IF;
END //
DELIMITER ;

CALL add_s3_columns_if_needed('verification_documents');
CALL add_s3_columns_if_needed('exports');
CALL add_s3_columns_if_needed('contracts');
CALL add_s3_columns_if_needed('claims');
CALL add_s3_columns_if_needed('management_agreements');

-- Potential legacy document tables (added if they exist in this deployment).
CALL add_s3_columns_if_needed('borrower_documents');
CALL add_s3_columns_if_needed('loan_applications');
CALL add_s3_columns_if_needed('loan_agreements');
CALL add_s3_columns_if_needed('lender_documents');
CALL add_s3_columns_if_needed('management_agreements');
CALL add_s3_columns_if_needed('court_claim_exports');
CALL add_s3_columns_if_needed('reports');

DROP PROCEDURE IF EXISTS add_s3_columns_if_needed;


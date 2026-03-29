-- Add auto-computed rank column to companies (1 = highest).
-- Rank is updated by application logic based on funds managed and account tenure.
-- Run once. If column already exists, skip or use: ALTER TABLE companies ADD COLUMN rank INT NULL;
ALTER TABLE companies ADD COLUMN rank INT NULL AFTER admin_revision_note;

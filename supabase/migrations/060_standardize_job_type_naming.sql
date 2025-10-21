-- Standardize job_type naming from kebab-case to snake_case
-- This fixes a naming mismatch between database inserts and UI expectations

-- Update detect-connections to detect_connections
UPDATE background_jobs
SET job_type = 'detect_connections'
WHERE job_type = 'detect-connections';

-- Update obsidian-export to obsidian_export
UPDATE background_jobs
SET job_type = 'obsidian_export'
WHERE job_type = 'obsidian-export';

-- Update obsidian-sync to obsidian_sync
UPDATE background_jobs
SET job_type = 'obsidian_sync'
WHERE job_type = 'obsidian-sync';

-- Update readwise-import to readwise_import
UPDATE background_jobs
SET job_type = 'readwise_import'
WHERE job_type = 'readwise-import';

-- Update scan-vault to scan_vault
UPDATE background_jobs
SET job_type = 'scan_vault'
WHERE job_type = 'scan-vault';

-- Update import-from-vault to import_from_vault
UPDATE background_jobs
SET job_type = 'import_from_vault'
WHERE job_type = 'import-from-vault';

-- Update reprocess-document to reprocess_document
UPDATE background_jobs
SET job_type = 'reprocess_document'
WHERE job_type = 'reprocess-document';

-- Update continue-processing to continue_processing
UPDATE background_jobs
SET job_type = 'continue_processing'
WHERE job_type = 'continue-processing';

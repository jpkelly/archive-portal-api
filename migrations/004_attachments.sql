-- Add binary content column to the existing attachments table and make
-- storage_location nullable (content is now stored inline as a BLOB).
USE mail_archive;
ALTER TABLE attachments ADD COLUMN content LONGBLOB AFTER size_bytes;
ALTER TABLE attachments MODIFY COLUMN storage_location TEXT NULL DEFAULT NULL;

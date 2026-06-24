-- Attachments table: stores extracted attachment metadata + binary content
-- for archived messages. Content is capped at 25 MB during ingest; larger
-- attachments are skipped with a warning.
CREATE TABLE IF NOT EXISTS attachments (
  id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  filename VARCHAR(512) DEFAULT NULL,
  content_type VARCHAR(255) DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  content LONGBLOB,
  created_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_attachments_message (message_id),
  CONSTRAINT fk_attachments_message FOREIGN KEY (message_id)
    REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

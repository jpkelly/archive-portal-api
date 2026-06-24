const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

router.use(requireAuth);

router.get('/folders/:folderId/messages', async (req, res) => {
  const { folderId } = req.params;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const q = String(req.query.q || '').trim();
  const fromDate = String(req.query.fromDate || '').trim();
  const toDate = String(req.query.toDate || '').trim();
  const qLike = `%${q}%`;

  try {
    const whereSql = `WHERE m.folder_id = ?
      AND (dm.user_id IS NOT NULL OR ? = 'admin')
      AND (? = '' OR m.subject LIKE ? OR m.from_email LIKE ? OR m.from_name LIKE ?)
      AND (? = '' OR COALESCE(m.sent_at, m.received_at) >= ?)
      AND (? = '' OR COALESCE(m.sent_at, m.received_at) < DATE_ADD(?, INTERVAL 1 DAY))`;

    const rows = await query(
      `SELECT m.id, m.subject, m.from_name, m.from_email, m.sent_at, m.received_at, m.has_attachments, m.preview_text
       FROM messages m
       JOIN folders f ON f.id = m.folder_id
       JOIN mail_accounts a ON a.id = f.account_id
       LEFT JOIN domain_members dm ON dm.domain_id = a.domain_id AND dm.user_id = ?
       ${whereSql}
       ORDER BY COALESCE(m.sent_at, m.received_at) DESC
       LIMIT ? OFFSET ?`,
      [req.auth.sub, folderId, req.auth.role, q, qLike, qLike, qLike, fromDate, fromDate, toDate, toDate, limit, offset]
    );

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM messages m
       JOIN folders f ON f.id = m.folder_id
       JOIN mail_accounts a ON a.id = f.account_id
       LEFT JOIN domain_members dm ON dm.domain_id = a.domain_id AND dm.user_id = ?
       ${whereSql}`,
      [req.auth.sub, folderId, req.auth.role, q, qLike, qLike, qLike, fromDate, fromDate, toDate, toDate]
    );
    const total = Number((countRows[0] || {}).total || 0);

    return res.json({ messages: rows, limit, offset, total, q, fromDate, toDate });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch messages', detail: err.message });
  }
});

router.get('/:messageId', async (req, res) => {
  const { messageId } = req.params;

  try {
    const rows = await query(
      `SELECT m.id, m.subject, m.from_name, m.from_email, m.to_list, m.cc_list, m.bcc_list,
              m.sent_at, m.received_at, m.preview_text, m.body_text, m.body_html, m.raw_location,
              a.id AS account_id, a.username, d.id AS domain_id, d.name AS domain_name
       FROM messages m
       JOIN folders f ON f.id = m.folder_id
       JOIN mail_accounts a ON a.id = f.account_id
       JOIN domains d ON d.id = a.domain_id
       LEFT JOIN domain_members dm ON dm.domain_id = d.id AND dm.user_id = ?
       WHERE m.id = ? AND (dm.user_id IS NOT NULL OR ? = 'admin')
       LIMIT 1`,
      [req.auth.sub, messageId, req.auth.role]
    );

    const message = rows[0];
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.json({ message });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch message', detail: err.message });
  }
});

// List attachments for a specific message (metadata only — no binary content).
router.get('/:messageId/attachments', async (req, res) => {
  const { messageId } = req.params;

  try {
    // Verify the user can access this message's domain.
    const accessRows = await query(
      `SELECT 1 FROM messages m
       JOIN folders f ON f.id = m.folder_id
       JOIN mail_accounts a ON a.id = f.account_id
       LEFT JOIN domain_members dm ON dm.domain_id = a.domain_id AND dm.user_id = ?
       WHERE m.id = ? AND (dm.user_id IS NOT NULL OR ? = 'admin')
       LIMIT 1`,
      [req.auth.sub, messageId, req.auth.role]
    );
    if (!accessRows.length) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const rows = await query(
      `SELECT id, filename, mime_type, size_bytes, created_at
       FROM attachments
       WHERE message_id = ?
       ORDER BY filename ASC`,
      [messageId]
    );

    return res.json({ attachments: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch attachments', detail: err.message });
  }
});

// Download a single attachment's binary content.
// Serves from the BLOB column when available; falls back to on-demand
// extraction from the S3 archive tarball for older messages.
// Must be defined before /:messageId to avoid route collision.
router.get('/attachments/:attachmentId/download', async (req, res) => {
  var attachmentId = req.params.attachmentId;

  try {
    var rows = await query(
      `SELECT a.id, a.filename, a.mime_type, a.size_bytes, a.content,
              m.id AS message_id, m.raw_location
       FROM attachments a
       JOIN messages m ON m.id = a.message_id
       JOIN folders f ON f.id = m.folder_id
       JOIN mail_accounts ma ON ma.id = f.account_id
       LEFT JOIN domain_members dm ON dm.domain_id = ma.domain_id AND dm.user_id = ?
       WHERE a.id = ? AND (dm.user_id IS NOT NULL OR ? = 'admin')
       LIMIT 1`,
      [req.auth.sub, attachmentId, req.auth.role]
    );

    var att = rows[0];
    if (!att) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    var filename = att.filename || 'attachment';
    var mimeType = att.mime_type || 'application/octet-stream';
    var content = att.content;

    // Fast path: content already stored as a BLOB.
    if (content && (content instanceof Buffer) && content.length > 0) {
      res.set('Content-Type', mimeType);
      res.set('Content-Length', String(content.length));
      res.set('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
      res.set('Cache-Control', 'private, max-age=86400');
      return res.send(content);
    }

    // Slow path: extract on-demand from the S3 archive tarball.
    var rawLocation = att.raw_location;
    if (!rawLocation || rawLocation.indexOf('#') === -1) {
      return res.status(404).json({ error: 'Attachment content not available (no archive reference)' });
    }

    var hashIdx = rawLocation.indexOf('#');
    var s3Uri = rawLocation.slice(0, hashIdx);
    var memberPath = rawLocation.slice(hashIdx + 1);

    var extractorScript = path.join(__dirname, '..', '..', 'scripts', 'extract_attachment.py');
    var child = spawn('python3', [
      extractorScript,
      s3Uri,
      memberPath,
      filename,
      String(att.size_bytes || 0),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    var contentTypeSent = false;
    var stdoutBufs = [];

    child.stdout.on('data', function (chunk) {
      if (!contentTypeSent) {
        // First line of stdout is "CONTENT_TYPE:<mime>"
        var newlineIdx = chunk.indexOf('\n'.charCodeAt(0));
        if (newlineIdx !== -1) {
          var headerLine = chunk.slice(0, newlineIdx).toString('utf8');
          var ctMatch = headerLine.match(/^CONTENT_TYPE:(.+)$/);
          if (ctMatch) {
            mimeType = ctMatch[1].trim();
          }
          res.set('Content-Type', mimeType);
          res.set('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
          res.set('Cache-Control', 'private, max-age=3600');
          contentTypeSent = true;

          // Send the remainder of this chunk (after the newline).
          var rest = chunk.slice(newlineIdx + 1);
          if (rest.length > 0) {
            res.write(rest);
          }
          // Flush any previously buffered chunks (shouldn't happen, but safe).
          for (var i = 0; i < stdoutBufs.length; i++) {
            res.write(stdoutBufs[i]);
          }
          stdoutBufs = null;
        } else {
          // Newline not yet seen — buffer.
          stdoutBufs.push(chunk);
        }
      } else {
        res.write(chunk);
      }
    });

    child.stdout.on('end', function () {
      if (!contentTypeSent) {
        // No output from extractor — likely error.
        if (!res.headersSent) {
          res.status(500).json({ error: 'Attachment extraction produced no output' });
        }
      }
      res.end();
    });

    child.on('error', function (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Extraction process failed', detail: err.message });
      } else {
        res.end();
      }
    });

    var stderr = '';
    child.stderr.on('data', function (chunk) {
      stderr += chunk.toString('utf8');
    });

    child.on('close', function (code) {
      if (code !== 0 && !res.headersSent) {
        var msg = stderr.trim() || ('Extraction exited with code ' + code);
        res.status(500).json({ error: msg });
      }
    });

  } catch (err) {
    return res.status(500).json({ error: 'Could not download attachment', detail: err.message });
  }
});

module.exports = router;

const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

// Simple UUID v4 generator — avoids adding a dependency.
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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
  var messageId = req.params.messageId;

  try {
    var rows = await query(
      `SELECT m.id, m.subject, m.from_name, m.from_email, m.to_list, m.cc_list, m.bcc_list,
              m.sent_at, m.received_at, m.has_attachments, m.preview_text, m.body_text, m.body_html, m.raw_location,
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

    var message = rows[0];
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // If body is already cached, return immediately.
    if (message.body_text !== null && message.body_text !== undefined) {
      return res.json({ message: message });
    }

    // Slow path: extract body on-demand from the S3 tarball.
    var rawLocation = message.raw_location;
    if (!rawLocation || rawLocation.indexOf('#') === -1) {
      // No S3 reference — return what we have (headers only).
      return res.json({ message: message });
    }

    var hashIdx = rawLocation.indexOf('#');
    var s3Uri = rawLocation.slice(0, hashIdx);
    var memberPath = rawLocation.slice(hashIdx + 1);

    var extractorScript = path.join(__dirname, '..', '..', 'scripts', 'extract_body.py');
    var child = spawn('python3', [extractorScript, s3Uri, memberPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    var stdout = '';
    var stderr = '';
    child.stdout.on('data', function (chunk) { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', function (chunk) { stderr += chunk.toString('utf8'); });

    child.on('close', async function (code) {
      if (code !== 0) {
        // Extraction failed — return headers only, don't break the UI.
        console.error('[body extraction] exit ' + code + ': ' + (stderr.trim() || 'no stderr'));
        return res.json({ message: message });
      }

      try {
        var bodyData = JSON.parse(stdout.trim());
        if (bodyData.body_text !== undefined) {
          message.body_text = bodyData.body_text;
          message.body_html = bodyData.body_html || '';
          message.preview_text = bodyData.preview_text || '';
        }

        // Cache the extracted body in the DB so subsequent views are instant.
        try {
          await query(
            'UPDATE messages SET body_text = ?, body_html = ?, preview_text = ? WHERE id = ?',
            [message.body_text || '', message.body_html || '', message.preview_text || '', messageId]
          );
        } catch (cacheErr) {
          // Non-critical: body still works even if cache update fails.
        }

        return res.json({ message: message });
      } catch (parseErr) {
        return res.json({ message: message });
      }
    });

    child.on('error', function (err) {
      return res.json({ message: message });
    });

  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch message', detail: err.message });
  }
});

// List attachments for a specific message.
// Fast path: reads from the attachments table (populated during ingest).
// Slow path: on-the-fly extraction from the S3 tarball via list_attachments.py.
router.get('/:messageId/attachments', async (req, res) => {
  var messageId = req.params.messageId;

  try {
    // Verify the user can access this message's domain.
    var accessRows = await query(
      `SELECT m.id, m.has_attachments, m.raw_location
       FROM messages m
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

    var msg = accessRows[0];

    // Fast path: attachments already stored in the database.
    var rows = await query(
      'SELECT id, filename, mime_type, size_bytes, created_at FROM attachments WHERE message_id = ? ORDER BY filename ASC',
      [messageId]
    );
    if (rows.length > 0) {
      return res.json({ attachments: rows, source: 'db' });
    }

    // Slow path: no stored attachments but the message has them —
    // extract metadata on-the-fly from the S3 tarball.
    if (!msg.has_attachments) {
      return res.json({ attachments: [], source: 'none' });
    }

    var rawLocation = msg.raw_location;
    if (!rawLocation || rawLocation.indexOf('#') === -1) {
      return res.json({ attachments: [], source: 'unavailable' });
    }

    var hashIdx = rawLocation.indexOf('#');
    var s3Uri = rawLocation.slice(0, hashIdx);
    var memberPath = rawLocation.slice(hashIdx + 1);

    var extractorScript = path.join(__dirname, '..', '..', 'scripts', 'list_attachments.py');
    var child = spawn('python3', [extractorScript, s3Uri, memberPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    var stdout = '';
    var stderr = '';
    child.stdout.on('data', function (chunk) { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', function (chunk) { stderr += chunk.toString('utf8'); });

    child.on('close', async function (code) {
      if (code !== 0) {
        return res.status(500).json({ error: 'Attachment extraction failed: ' + (stderr.trim() || 'exit ' + code) });
      }

      var discovered = [];
      var lines = stdout.trim().split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        try {
          var obj = JSON.parse(line);
          if (obj.filename) {
            discovered.push(obj);
          }
        } catch (e) {
          // Skip malformed JSON lines.
        }
      }

      // Store discovered metadata in the attachments table so subsequent
      // views use the fast DB path. Content is NULL (served on-demand from S3).
      var attachments = [];
      for (var j = 0; j < discovered.length; j++) {
        var d = discovered[j];
        var attId = generateUUID();
        try {
          await query(
            'INSERT INTO attachments (id, message_id, filename, mime_type, size_bytes, content, storage_location, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, NOW()) ON DUPLICATE KEY UPDATE filename = VALUES(filename)',
            [attId, messageId, d.filename, d.mime_type || 'application/octet-stream', d.size_bytes || 0, 'db']
          );
        } catch (insertErr) {
          // Non-critical: attachment list still works even if insert fails.
        }
        attachments.push({
          id: attId,
          filename: d.filename,
          mime_type: d.mime_type || 'application/octet-stream',
          size_bytes: d.size_bytes || 0,
          created_at: null,
        });
      }

      return res.json({ attachments: attachments, source: 's3' });
    });

    child.on('error', function (err) {
      return res.status(500).json({ error: 'Extraction process failed: ' + err.message });
    });

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

    // Set headers now — we already know the MIME type and filename from the DB.
    res.set('Content-Type', mimeType);
    res.set('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
    res.set('Cache-Control', 'private, max-age=3600');

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

    // Buffer all stdout before sending — avoids half-sent responses on error.
    var stdoutChunks = [];
    child.stdout.on('data', function (chunk) { stdoutChunks.push(chunk); });

    var stderr = '';
    child.stderr.on('data', function (chunk) { stderr += chunk.toString('utf8'); });

    child.on('close', function (code) {
      if (code !== 0) {
        console.error('[attachment download] exit ' + code + ': ' + (stderr.trim() || 'no stderr'));
        return res.status(500).json({ error: 'Attachment extraction failed: ' + (stderr.trim() || 'exit ' + code) });
      }
      var body = Buffer.concat(stdoutChunks);
      res.set('Content-Type', mimeType);
      res.set('Content-Length', String(body.length));
      res.set('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
      res.set('Cache-Control', 'private, max-age=3600');
      return res.send(body);
    });

    child.on('error', function (err) {
      console.error('[attachment download] spawn error: ' + err.message);
      return res.status(500).json({ error: 'Extraction process failed: ' + err.message });
    });

  } catch (err) {
    return res.status(500).json({ error: 'Could not download attachment', detail: err.message });
  }
});

module.exports = router;

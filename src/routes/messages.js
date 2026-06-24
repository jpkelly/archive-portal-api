const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

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
      `SELECT id, filename, content_type, size_bytes, created_at
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
// Must be defined before /:messageId to avoid route collision.
router.get('/attachments/:attachmentId/download', async (req, res) => {
  const { attachmentId } = req.params;

  try {
    const rows = await query(
      `SELECT a.id, a.filename, a.content_type, a.size_bytes, a.content,
              m.id AS message_id
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
    var content = att.content;
    if (!content || !(content instanceof Buffer) || content.length === 0) {
      return res.status(404).json({ error: 'Attachment content is empty' });
    }

    res.set('Content-Type', att.content_type || 'application/octet-stream');
    res.set('Content-Length', String(content.length));
    res.set('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
    res.set('Cache-Control', 'private, max-age=86400');
    return res.send(content);
  } catch (err) {
    return res.status(500).json({ error: 'Could not download attachment', detail: err.message });
  }
});

module.exports = router;

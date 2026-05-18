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

module.exports = router;

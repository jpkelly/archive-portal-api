const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/folders/:folderId/messages', async (req, res) => {
  const { folderId } = req.params;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  try {
    const rows = await query(
      `SELECT m.id, m.subject, m.from_name, m.from_email, m.sent_at, m.received_at, m.has_attachments, m.preview_text
       FROM messages m
       JOIN folders f ON f.id = m.folder_id
       JOIN mail_accounts a ON a.id = f.account_id
       JOIN domain_members dm ON dm.domain_id = a.domain_id
       WHERE m.folder_id = ?
         AND (dm.user_id = ? OR ? = 'admin')
       ORDER BY COALESCE(m.sent_at, m.received_at) DESC
       LIMIT ? OFFSET ?`,
      [folderId, req.auth.sub, req.auth.role, limit, offset]
    );

    return res.json({ messages: rows, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch messages', detail: err.message });
  }
});

router.get('/:messageId', async (req, res) => {
  const { messageId } = req.params;

  try {
    const rows = await query(
      `SELECT m.id, m.subject, m.from_name, m.from_email, m.to_list, m.cc_list, m.bcc_list,
              m.sent_at, m.received_at, m.preview_text, m.body_text, m.raw_location,
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

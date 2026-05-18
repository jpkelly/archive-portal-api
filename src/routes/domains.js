const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT d.id, d.name, d.status, d.created_at
      FROM domains d
      JOIN domain_members dm ON dm.domain_id = d.id
      WHERE dm.user_id = ?
      ORDER BY d.name ASC
    `;

    const rows = await query(sql, [req.auth.sub]);
    return res.json({ domains: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch domains', detail: err.message });
  }
});

router.get('/:domainId/accounts', async (req, res) => {
  const { domainId } = req.params;

  try {
    const access = await query(
      'SELECT 1 FROM domain_members WHERE user_id = ? AND domain_id = ? LIMIT 1',
      [req.auth.sub, domainId]
    );

    if (!access.length && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied for this domain' });
    }

    const accounts = await query(
      `SELECT id, username, display_name, message_count, folder_count, last_indexed_at
       FROM mail_accounts
       WHERE domain_id = ?
       ORDER BY username ASC`,
      [domainId]
    );

    return res.json({ accounts });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch accounts', detail: err.message });
  }
});

router.get('/:domainId/accounts/:accountId/folders', async (req, res) => {
  const { domainId, accountId } = req.params;

  try {
    const access = await query(
      'SELECT 1 FROM domain_members WHERE user_id = ? AND domain_id = ? LIMIT 1',
      [req.auth.sub, domainId]
    );

    if (!access.length && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied for this domain' });
    }

    const folders = await query(
      `SELECT id, path, display_name, message_count
       FROM folders
       WHERE account_id = ?
       ORDER BY path ASC`,
      [accountId]
    );

    return res.json({ folders });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch folders', detail: err.message });
  }
});

module.exports = router;

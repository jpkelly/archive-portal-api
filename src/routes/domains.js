const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function requireAdmin(req, res) {
  if (req.auth.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

async function canAccessDomain(userId, domainId, role) {
  if (role === 'admin') return true;
  const access = await query(
    'SELECT 1 FROM domain_members WHERE user_id = ? AND domain_id = ? LIMIT 1',
    [userId, domainId]
  );
  return Boolean(access.length);
}

router.get('/', async (req, res) => {
  try {
    const sql = req.auth.role === 'admin'
      ? `SELECT d.id, d.name, d.status, d.created_at FROM domains d ORDER BY d.name ASC`
      : `SELECT d.id, d.name, d.status, d.created_at
         FROM domains d
         JOIN domain_members dm ON dm.domain_id = d.id
         WHERE dm.user_id = ?
         ORDER BY d.name ASC`;

    const rows = req.auth.role === 'admin' ? await query(sql) : await query(sql, [req.auth.sub]);
    return res.json({ domains: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch domains', detail: err.message });
  }
});

router.get('/:domainId', async (req, res) => {
  const { domainId } = req.params;

  try {
    if (!(await canAccessDomain(req.auth.sub, domainId, req.auth.role))) {
      return res.status(403).json({ error: 'Access denied for this domain' });
    }

    const domains = await query(
      `SELECT id, name, status, archive_source, created_at
       FROM domains
       WHERE id = ?
       LIMIT 1`,
      [domainId]
    );

    const members = await query(
      `SELECT u.id, u.email, u.primary_email, u.role, dm.permission, dm.created_at
       FROM domain_members dm
       JOIN users u ON u.id = dm.user_id
       WHERE dm.domain_id = ?
       ORDER BY u.email ASC`,
      [domainId]
    );

    const domain = domains[0];
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    return res.json({ domain, members });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch domain details', detail: err.message });
  }
});

router.patch('/:domainId', async (req, res) => {
  const { domainId } = req.params;
  const { status } = req.body || {};

  try {
    if (!requireAdmin(req, res)) return;
    if (!['active', 'archived', 'restricted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid domain status' });
    }

    await query('UPDATE domains SET status = ? WHERE id = ?', [status, domainId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not update domain', detail: err.message });
  }
});

router.post('/:domainId/members', async (req, res) => {
  const { domainId } = req.params;
  const { email, permission } = req.body || {};

  try {
    if (!requireAdmin(req, res)) return;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!['read', 'admin'].includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission' });
    }

    const users = await query(
      'SELECT id FROM users WHERE email = ? OR primary_email = ? LIMIT 1',
      [email, email]
    );

    const user = users[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await query(
      `INSERT INTO domain_members (id, user_id, domain_id, permission, created_at)
       VALUES (UUID(), ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE permission = VALUES(permission)`,
      [user.id, domainId, permission]
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not add domain member', detail: err.message });
  }
});

router.delete('/:domainId/members/:userId', async (req, res) => {
  const { domainId, userId } = req.params;

  try {
    if (!requireAdmin(req, res)) return;

    await query(
      'DELETE FROM domain_members WHERE domain_id = ? AND user_id = ?',
      [domainId, userId]
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not remove domain member', detail: err.message });
  }
});

router.get('/:domainId/accounts', async (req, res) => {
  const { domainId } = req.params;

  try {
    if (!(await canAccessDomain(req.auth.sub, domainId, req.auth.role))) {
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
    if (!(await canAccessDomain(req.auth.sub, domainId, req.auth.role))) {
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

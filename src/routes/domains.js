const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const execFileAsync = promisify(execFile);

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

function escapeSqlLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function syncDomainAccountsFromPlesk(domainName) {
  const safeDomain = escapeSqlLiteral(domainName);
  const sql = [
    'INSERT INTO mail_archive.mail_accounts',
    '  (id, domain_id, username, display_name, source_path, message_count, folder_count, created_at, updated_at)',
    'SELECT UUID(), d.id, CONCAT(m.mail_name, "@", pd.name), m.mail_name, "plesk-mailbox-sync", 0, 0, NOW(), NOW()',
    'FROM psa.mail m',
    'JOIN psa.domains pd ON pd.id = m.dom_id',
    'JOIN mail_archive.domains d ON d.name = pd.name',
    'LEFT JOIN mail_archive.mail_accounts a',
    '  ON a.domain_id = d.id AND a.username = CONCAT(m.mail_name, "@", pd.name)',
    `WHERE pd.name = '${safeDomain}'`,
    '  AND m.postbox = "true"',
    '  AND a.id IS NULL',
  ].join(' ');

  await execFileAsync('sudo', ['plesk', 'db', '-e', sql], { maxBuffer: 1024 * 1024 });
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
  const { status, syncAccounts } = req.body || {};

  try {
    if (!requireAdmin(req, res)) return;

    const domains = await query(
      'SELECT id, name FROM domains WHERE id = ? LIMIT 1',
      [domainId]
    );
    const domain = domains[0];
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const result = { ok: true, domain: domain.name };

    if (typeof status !== 'undefined') {
      if (!['active', 'archived', 'restricted'].includes(status)) {
        return res.status(400).json({ error: 'Invalid domain status' });
      }
      await query('UPDATE domains SET status = ? WHERE id = ?', [status, domainId]);
      result.status = status;
    }

    if (syncAccounts === true) {
      const beforeRows = await query(
        'SELECT COUNT(*) AS count FROM mail_accounts WHERE domain_id = ?',
        [domain.id]
      );
      const beforeCount = Number(beforeRows[0] && beforeRows[0].count ? beforeRows[0].count : 0);

      await syncDomainAccountsFromPlesk(domain.name);

      const afterRows = await query(
        'SELECT COUNT(*) AS count FROM mail_accounts WHERE domain_id = ?',
        [domain.id]
      );
      const afterCount = Number(afterRows[0] && afterRows[0].count ? afterRows[0].count : 0);

      result.inserted = Math.max(0, afterCount - beforeCount);
      result.total = afterCount;
    }

    if (typeof status === 'undefined' && syncAccounts !== true) {
      return res.status(400).json({ error: 'No updates requested' });
    }

    return res.json(result);
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

    const enriched = accounts.map((a) => ({
      ...a,
      sync_status: a.last_indexed_at ? 'indexed' : 'not_indexed',
      indexed_at: a.last_indexed_at || null,
    }));

    return res.json({ accounts: enriched });
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

router.post('/:domainId/accounts/:accountId/ingest', async (req, res) => {
  const { domainId, accountId } = req.params;

  try {
    if (!requireAdmin(req, res)) return;

    const account = await query(
      'SELECT a.username, d.name FROM mail_accounts a JOIN domains d ON d.id=a.domain_id WHERE a.id=? AND d.id=? LIMIT 1',
      [accountId, domainId]
    );

    if (!account.length) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const [user] = account;
    const domain = user.name;
    const username = user.username.split('@')[0];

    const { stdout } = await execFileAsync('sh', ['-c', `
      aws s3 ls s3://smallgod-mail-archive/archive/ --recursive | tail -n 1 | awk '{print $NF}' | sed 's#.*archive/##;s#/.*##'
    `]);

    const latestTimestamp = stdout.trim();
    if (!latestTimestamp) {
      return res.json({ 
        ok: false, 
        error: 'No archives found in S3',
        account_id: accountId 
      });
    }

    const s3Path = `s3://smallgod-mail-archive/archive/${latestTimestamp}/${domain}/${username}/${domain}_${username}_pre2025_${latestTimestamp}.tar.gz`;

    // Queue ingest job (async, fire-and-forget)
    const jobId = `ingest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setImmediate(async () => {
      try {
        await execFileAsync('python3', [
          '/var/www/vhosts/smallgod.net/archive.smallgod.net/scripts/ingest_worker.py',
          domain,
          username,
          s3Path,
        ]);
      } catch (err) {
        console.error(`[ingest job ${jobId}] error:`, err.message);
      }
    });

    return res.json({
      ok: true,
      account_id: accountId,
      message: `Queued ingest for ${user.username}`,
      job_id: jobId,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Could not queue ingest', detail: err.message });
  }
});

module.exports = router;

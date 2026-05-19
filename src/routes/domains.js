const express = require('express');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const execFileAsync = promisify(execFile);
const awsEnv = {
  ...process.env,
  HOME: '/home/centos',
  AWS_CONFIG_FILE: '/home/centos/.aws/config',
  AWS_SHARED_CREDENTIALS_FILE: '/home/centos/.aws/credentials',
};
const ingestProgressByAccount = new Map();
const archiveStateByAccount = new Map();

function setIngestProgress(accountId, text) {
  ingestProgressByAccount.set(accountId, { text, updatedAt: Date.now() });
}

function clearIngestProgressLater(accountId, delayMs = 30000) {
  setTimeout(() => {
    ingestProgressByAccount.delete(accountId);
  }, delayMs);
}

function getIngestProgress(accountId) {
  const progress = ingestProgressByAccount.get(accountId);
  if (!progress) return null;
  // Drop stale progress after 30 minutes to avoid permanent stuck badges.
  if ((Date.now() - progress.updatedAt) > (30 * 60 * 1000)) {
    ingestProgressByAccount.delete(accountId);
    return null;
  }
  return progress;
}

function parseIsoDateOnly(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function toIsoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeArchiveRange(payload) {
  const mode = String((payload && payload.mode) || 'before');
  if (!['before', 'range'].includes(mode)) {
    return { error: 'mode must be either "before" or "range"' };
  }

  if (mode === 'before') {
    const beforeDate = parseIsoDateOnly(payload && payload.beforeDate);
    if (!beforeDate) {
      return { error: 'beforeDate (YYYY-MM-DD) is required for mode "before"' };
    }
    const before = new Date(`${beforeDate}T00:00:00Z`);
    const to = new Date(before.getTime() - (24 * 60 * 60 * 1000));
    return {
      mode,
      beforeDate,
      fromDate: '1970-01-01',
      toDate: toIsoDateOnly(to),
      label: `before ${beforeDate}`,
    };
  }

  const fromDate = parseIsoDateOnly(payload && payload.fromDate);
  const toDate = parseIsoDateOnly(payload && payload.toDate);
  if (!fromDate || !toDate) {
    return { error: 'fromDate and toDate (YYYY-MM-DD) are required for mode "range"' };
  }
  if (new Date(`${fromDate}T00:00:00Z`) > new Date(`${toDate}T00:00:00Z`)) {
    return { error: 'fromDate must be before or equal to toDate' };
  }
  return {
    mode,
    fromDate,
    toDate,
    beforeDate: null,
    label: `${fromDate} to ${toDate}`,
  };
}

async function verifyS3ObjectExists(s3Uri) {
  if (!s3Uri) return false;
  try {
    await execFileAsync('/usr/bin/aws', ['s3', 'ls', s3Uri], { env: awsEnv, maxBuffer: 1024 * 1024 });
    return true;
  } catch (_) {
    return false;
  }
}

function parseKeyValueStdout(stdout) {
  const out = {};
  String(stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf('=');
      if (idx <= 0) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      out[key] = value;
    });
  return out;
}

async function getAccountDomainAndUser(domainId, accountId) {
  const rows = await query(
    `SELECT a.id, a.username, d.name AS domain_name
     FROM mail_accounts a
     JOIN domains d ON d.id = a.domain_id
     WHERE a.id = ? AND d.id = ?
     LIMIT 1`,
    [accountId, domainId]
  );
  return rows[0] || null;
}

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

async function getLatestArchiveTimestamp() {
  const { stdout } = await execFileAsync(
    '/usr/bin/aws',
    ['s3', 'ls', 's3://smallgod-mail-archive/archive/'],
    { env: awsEnv, maxBuffer: 1024 * 1024 }
  );

  const timestamps = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).pop().replace(/\/$/, ''))
    .filter((entry) => /^\d{8}_\d{6}$/.test(entry));

  return timestamps.length ? timestamps[timestamps.length - 1] : '';
}

async function findAccountArchivePath(domain, username) {
  const latestTimestamp = await getLatestArchiveTimestamp();
  if (!latestTimestamp) {
    return null;
  }

  const prefix = `s3://smallgod-mail-archive/archive/${latestTimestamp}/${domain}/${username}/`;
  let stdout = '';
  try {
    const result = await execFileAsync(
      '/usr/bin/aws',
      ['s3', 'ls', prefix],
      { env: awsEnv, maxBuffer: 1024 * 1024 }
    );
    stdout = result.stdout || '';
  } catch (err) {
    const stderr = String((err && err.stderr) || '').trim();
    // Some account prefixes return non-zero with no output. Treat as no archive.
    if (!stderr) {
      return null;
    }
    throw err;
  }

  const tarball = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).pop())
    .find((name) => name.endsWith('.tar.gz'));

  if (!tarball) {
    return null;
  }

  return `${prefix}${tarball}`;
}

async function queueIngest(req, res) {
  const { domainId, accountId } = req.params;

  try {
    const { sub: userId, role } = req.auth;
    if (!await canAccessDomain(userId, domainId, role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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

    const s3Path = await findAccountArchivePath(domain, username);
    if (!s3Path) {
      return res.json({
        ok: false,
        error: 'No archives found in S3',
        account_id: accountId,
      });
    }

    const jobId = `ingest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setIngestProgress(accountId, '1/5 queued');
    setImmediate(() => {
      try {
        const child = spawn('python3', [
          '/var/www/vhosts/smallgod.net/archive.smallgod.net/scripts/ingest_worker.py',
          domain,
          username,
          s3Path,
        ]);

        const handleLine = (line) => {
          const trimmed = String(line || '').trim();
          if (!trimmed) return;
          const marker = 'PROGRESS:';
          if (trimmed.startsWith(marker)) {
            setIngestProgress(accountId, trimmed.slice(marker.length).trim());
          }
        };

        let stdoutBuffer = '';
        child.stdout.on('data', (chunk) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() || '';
          lines.forEach(handleLine);
        });

        child.stderr.on('data', () => {
          // Worker stderr is logged by PM2; route progress should not depend on stderr text.
        });

        child.on('close', (code) => {
          if (code === 0) {
            clearIngestProgressLater(accountId, 10000);
            return;
          }
          setIngestProgress(accountId, 'failed');
          clearIngestProgressLater(accountId, 30000);
          console.error(`[ingest job ${jobId}] failed with exit code`, code);
        });
      } catch (err) {
        setIngestProgress(accountId, 'failed');
        clearIngestProgressLater(accountId, 30000);
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

    const enriched = accounts.map((a) => {
      const archive = archiveStateByAccount.get(a.id) || null;
      const progress = getIngestProgress(a.id);
      if (progress) {
        return {
          ...a,
          sync_status: 'indexing',
          sync_progress: progress.text,
          indexed_at: a.last_indexed_at || null,
          archive_state: archive,
        };
      }
      return {
        ...a,
        sync_status: a.last_indexed_at ? 'indexed' : 'not_indexed',
        sync_progress: null,
        indexed_at: a.last_indexed_at || null,
        archive_state: archive,
      };
    });

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

router.get('/:domainId/accounts/:accountId/archive-state', async (req, res) => {
  const { domainId, accountId } = req.params;

  try {
    if (!(await canAccessDomain(req.auth.sub, domainId, req.auth.role))) {
      return res.status(403).json({ error: 'Access denied for this domain' });
    }

    const account = await getAccountDomainAndUser(domainId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const state = archiveStateByAccount.get(accountId) || null;
    return res.json({ account_id: accountId, archive: state });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch archive state', detail: err.message });
  }
});

router.post('/:domainId/accounts/:accountId/archive/create', async (req, res) => {
  const { domainId, accountId } = req.params;

  try {
    if (!requireAdmin(req, res)) return;

    const account = await getAccountDomainAndUser(domainId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const normalized = normalizeArchiveRange(req.body || {});
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    const usernameLocal = String(account.username || '').split('@')[0];
    const jobId = `archive_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    archiveStateByAccount.set(accountId, {
      job_id: jobId,
      status: 'running',
      verified: false,
      verification_checked_at: null,
      verification_message: 'Archive job started',
      deletion_status: 'blocked',
      deletion_message: 'Deletion is blocked until archive verification passes',
      domain: account.domain_name,
      username: usernameLocal,
      mode: normalized.mode,
      beforeDate: normalized.beforeDate,
      fromDate: normalized.fromDate,
      toDate: normalized.toDate,
      range_label: normalized.label,
      requested_at: new Date().toISOString(),
      completed_at: null,
      error: null,
      archive_s3_uri: null,
      archive_file_count: 0,
      archive_source_bytes: 0,
      archive_bytes: 0,
      delete_count: null,
    });

    setImmediate(() => {
      try {
        const child = spawn(
          'bash',
          [
            '/var/www/vhosts/smallgod.net/archive.smallgod.net/scripts/archive_account_maintenance.sh',
            'archive',
            account.domain_name,
            usernameLocal,
            normalized.fromDate,
            normalized.toDate,
            normalized.mode,
          ],
          { env: awsEnv }
        );

        let stdout = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });

        child.stderr.on('data', () => {
          // stderr is logged by PM2; UI state is based on script key/value output.
        });

        child.on('close', async (code) => {
          const current = archiveStateByAccount.get(accountId);
          if (!current || current.job_id !== jobId) return;

          const parsed = parseKeyValueStdout(stdout);
          if (code !== 0) {
            archiveStateByAccount.set(accountId, {
              ...current,
              status: 'failed',
              verified: false,
              verification_checked_at: new Date().toISOString(),
              verification_message: 'Archive job failed',
              completed_at: new Date().toISOString(),
              error: parsed.ERROR || 'Archive script failed',
            });
            return;
          }

          if (String(parsed.STATUS || '') === 'no_files') {
            archiveStateByAccount.set(accountId, {
              ...current,
              status: 'completed_no_files',
              verified: true,
              verification_checked_at: new Date().toISOString(),
              verification_message: 'No matching files in this range',
              deletion_status: 'ready',
              deletion_message: 'No files matched; delete action is a no-op for this range',
              completed_at: new Date().toISOString(),
              archive_s3_uri: null,
              archive_file_count: 0,
              archive_source_bytes: 0,
              archive_bytes: 0,
              error: null,
            });
            return;
          }

          const s3Uri = parsed.ARCHIVE_S3_URI || null;
          const verified = await verifyS3ObjectExists(s3Uri);
          archiveStateByAccount.set(accountId, {
            ...current,
            status: 'completed',
            verified,
            verification_checked_at: new Date().toISOString(),
            verification_message: verified ? 'Archive found in S3' : 'Archive upload completed but S3 verification failed',
            deletion_status: verified ? 'ready' : 'blocked',
            deletion_message: verified
              ? 'Deletion is allowed for this verified range'
              : 'Deletion is blocked until archive verification passes',
            completed_at: new Date().toISOString(),
            error: null,
            archive_s3_uri: s3Uri,
            archive_file_count: Number(parsed.FILE_COUNT || 0),
            archive_source_bytes: Number(parsed.SOURCE_BYTES || 0),
            archive_bytes: Number(parsed.ARCHIVE_BYTES || 0),
          });
        });
      } catch (err) {
        const current = archiveStateByAccount.get(accountId);
        if (!current || current.job_id !== jobId) return;
        archiveStateByAccount.set(accountId, {
          ...current,
          status: 'failed',
          verified: false,
          verification_checked_at: new Date().toISOString(),
          verification_message: 'Archive job failed to start',
          completed_at: new Date().toISOString(),
          error: err.message,
        });
      }
    });

    return res.json({
      ok: true,
      account_id: accountId,
      job_id: jobId,
      message: `Archive job queued for ${account.username} (${normalized.label})`,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Could not start archive job', detail: err.message });
  }
});

router.post('/:domainId/accounts/:accountId/archive/verify', async (req, res) => {
  const { domainId, accountId } = req.params;

  try {
    if (!requireAdmin(req, res)) return;

    const account = await getAccountDomainAndUser(domainId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const current = archiveStateByAccount.get(accountId);
    if (!current) {
      return res.status(404).json({ error: 'No archive job found for this account' });
    }
    if (current.status === 'running') {
      return res.status(400).json({ error: 'Archive job is still running' });
    }

    const verified = current.archive_s3_uri
      ? await verifyS3ObjectExists(current.archive_s3_uri)
      : current.status === 'completed_no_files';

    const next = {
      ...current,
      verified,
      verification_checked_at: new Date().toISOString(),
      verification_message: verified
        ? (current.archive_s3_uri ? 'Archive found in S3' : 'No matching files in this range')
        : 'Archive object not found in S3',
      deletion_status: verified ? 'ready' : 'blocked',
      deletion_message: verified
        ? 'Deletion is allowed for this verified range'
        : 'Deletion is blocked until archive verification passes',
    };
    archiveStateByAccount.set(accountId, next);

    return res.json({ ok: true, account_id: accountId, archive: next });
  } catch (err) {
    return res.status(500).json({ error: 'Could not verify archive', detail: err.message });
  }
});

router.post('/:domainId/accounts/:accountId/archive/delete-messages', async (req, res) => {
  const { domainId, accountId } = req.params;

  try {
    if (!requireAdmin(req, res)) return;

    const account = await getAccountDomainAndUser(domainId, accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const current = archiveStateByAccount.get(accountId);
    if (!current) {
      return res.status(400).json({ error: 'No archive state found. Run archive first.' });
    }
    if (!current.verified) {
      return res.status(400).json({ error: 'Deletion is blocked until archive verification passes.' });
    }
    if (current.status === 'running') {
      return res.status(400).json({ error: 'Archive job is still running.' });
    }

    const usernameLocal = String(account.username || '').split('@')[0];
    const { stdout } = await execFileAsync(
      'bash',
      [
        '/var/www/vhosts/smallgod.net/archive.smallgod.net/scripts/archive_account_maintenance.sh',
        'delete',
        account.domain_name,
        usernameLocal,
        current.fromDate,
        current.toDate,
        current.mode,
      ],
      { env: awsEnv, maxBuffer: 1024 * 1024 }
    );

    const parsed = parseKeyValueStdout(stdout);
    const deletedCount = Number(parsed.DELETED_COUNT || 0);

    const next = {
      ...current,
      deletion_status: 'completed',
      deletion_message: `Deleted ${deletedCount} files from server maildir for verified range ${current.range_label}`,
      delete_count: deletedCount,
      deleted_at: new Date().toISOString(),
    };
    archiveStateByAccount.set(accountId, next);

    return res.json({
      ok: true,
      account_id: accountId,
      deleted_count: deletedCount,
      archive: next,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Could not delete messages', detail: err.message });
  }
});

router.get('/:domainId/accounts/:accountId/ingest', queueIngest);
router.post('/:domainId/accounts/:accountId/ingest', queueIngest);

module.exports = router;

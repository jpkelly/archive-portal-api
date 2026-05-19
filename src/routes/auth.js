const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { query } = require('../db');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function tempArchiveRootDir() {
  return path.join(os.tmpdir(), 'archive-portal-cache');
}

async function resetUsageStatsForUser(userId, role) {
  if (role === 'admin') {
    await query('UPDATE folders SET message_count = 0, updated_at = NOW()');
    await query('UPDATE mail_accounts SET message_count = 0, folder_count = 0, last_indexed_at = NULL, updated_at = NOW()');
    return;
  }

  await query(
    `UPDATE folders f
     JOIN mail_accounts a ON a.id = f.account_id
     JOIN domain_members dm ON dm.domain_id = a.domain_id
     SET f.message_count = 0, f.updated_at = NOW()
     WHERE dm.user_id = ?`,
    [userId]
  );
  await query(
    `UPDATE mail_accounts a
     JOIN domain_members dm ON dm.domain_id = a.domain_id
     SET a.message_count = 0,
         a.folder_count = 0,
         a.last_indexed_at = NULL,
         a.updated_at = NOW()
     WHERE dm.user_id = ?`,
    [userId]
  );
}

async function removeDirRecursive(dir) {
  if (typeof fs.promises.rm === 'function') {
    await fs.promises.rm(dir, { recursive: true, force: true });
    return;
  }

  try {
    await fs.promises.rmdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    let rows = await query(
      'SELECT id, email, primary_email, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (!rows.length) {
      rows = await query(
        'SELECT id, email, primary_email, password_hash, role FROM users WHERE primary_email = ? LIMIT 1',
        [email]
      );
    }

    const user = rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: jwtExpiresIn }
    );

    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    return res.json({
      token,
      user: { id: user.id, email: user.email, primary_email: user.primary_email, role: user.role },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed', detail: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, email, primary_email, role, created_at, last_login_at FROM users WHERE id = ? LIMIT 1',
      [req.auth.sub]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch profile', detail: err.message });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const role = req.auth.role;

    // Purge all temporary archives on logout.
    await removeDirRecursive(tempArchiveRootDir());

    // Reset mail usage stats so a new login starts from a clean usage view.
    await resetUsageStatsForUser(userId, role);

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not complete logout cleanup', detail: err.message });
  }
});

router.post('/reset-usage', requireAuth, async (req, res) => {
  try {
    await resetUsageStatsForUser(req.auth.sub, req.auth.role);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not reset usage stats', detail: err.message });
  }
});

module.exports = router;

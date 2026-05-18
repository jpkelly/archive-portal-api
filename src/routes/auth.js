const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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

module.exports = router;

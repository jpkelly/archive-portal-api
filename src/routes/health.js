const express = require('express');
const { query } = require('../db');
const { appVersion } = require('../config');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    await query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected', version: appVersion });
  } catch (err) {
    return res.status(500).json({ status: 'error', database: 'disconnected', version: appVersion, detail: err.message });
  }
});

module.exports = router;

const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    await query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    return res.status(500).json({ status: 'error', database: 'disconnected', detail: err.message });
  }
});

module.exports = router;

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');

const { corsOrigins } = require('./config');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const domainsRouter = require('./routes/domains');
const messagesRouter = require('./routes/messages');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');
const apiPrefixes = ['/health', '/auth', '/domains', '/messages'];

// Cache-busting version token for the SPA assets. Derived from the mtime of
// app.js/styles.css so a Plesk frontend deploy is picked up by browsers even
// without a PM2 restart. Computed per request (files are tiny) so it always
// reflects the currently deployed files.
function assetVersion() {
  let token = 0;
  for (const name of ['app.js', 'styles.css']) {
    try {
      token = Math.max(token, fs.statSync(path.join(publicDir, name)).mtimeMs);
    } catch (_) {
      // Missing file: ignore, fall back to whatever we have.
    }
  }
  return String(Math.floor(token) || Date.now());
}

function sendIndexHtml(res) {
  let html;
  try {
    html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  } catch (err) {
    return res.status(500).send('index.html not found');
  }
  const v = assetVersion();
  html = html
    .replace('/app.js', `/app.js?v=${v}`)
    .replace('/styles.css', `/styles.css?v=${v}`);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('html');
  return res.send(html);
}

app.use(helmet());
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/domains', domainsRouter);
app.use('/messages', messagesRouter);

app.use(express.static(publicDir, { index: false }));

app.get('*', (req, res, next) => {
  const isApi = apiPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(prefix + '/'));
  if (isApi) {
    return next();
  }

  return sendIndexHtml(res);
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

module.exports = app;

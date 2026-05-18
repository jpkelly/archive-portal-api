const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const domainsRouter = require('./routes/domains');
const messagesRouter = require('./routes/messages');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/domains', domainsRouter);
app.use('/messages', messagesRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

module.exports = app;

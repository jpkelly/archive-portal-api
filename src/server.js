const app = require('./app');
const { port, nodeEnv } = require('./config');

app.listen(port, () => {
  // Keep startup logs concise for Plesk logs.
  console.log(`archive-portal-api listening on port ${port} (${nodeEnv})`);
});

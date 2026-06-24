const dotenv = require('dotenv');
const { execSync } = require('child_process');
const path = require('path');

dotenv.config();

function requireEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (value === undefined || value === '') {
    throw new Error('Missing required environment variable: ' + name);
  }
  return value;
}

// Read the deployed git commit SHA once at startup. Tries in order:
// 1. Local git repo (development)
// 2. Plesk Git extension CLI (production — .git is not deployed)
// 3. package.json version
// 4. 'unknown'
var appVersion = 'unknown';
try {
  appVersion = String(execSync('git rev-parse --short HEAD', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  })).trim();
} catch (_) {
  try {
    // Plesk stores the deployed commit; query it via the CLI.
    var pleskOut = String(execSync(
      'sudo plesk ext git --get-last-commit -domain archive.smallgod.net -name archive-portal-api',
      { encoding: 'utf8', timeout: 5000 }
    )).trim();
    var m = pleskOut.match(/^commit\s+([0-9a-f]{7,})/m);
    if (m) {
      appVersion = m[1].slice(0, 7);
    }
  } catch (__) {
    try {
      var pkg = require('../package.json');
      if (pkg && pkg.version) {
        appVersion = 'v' + pkg.version;
      }
    } catch (___) {
      // Keep 'unknown'.
    }
  }
}

const corsOrigins = (process.env.CORS_ORIGINS || 'https://archive.smallgod.net')
  .split(',')
  .map(function (s) { return s.trim(); })
  .filter(function (s) { return s.length > 0; });

module.exports = {
  port: Number(process.env.PORT || 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: requireEnv('JWT_SECRET', null),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigins: corsOrigins,
  appVersion: appVersion,
  db: {
    host: requireEnv('DB_HOST', '127.0.0.1'),
    port: Number(process.env.DB_PORT || 3306),
    database: requireEnv('DB_NAME', null),
    user: requireEnv('DB_USER', null),
    password: requireEnv('DB_PASSWORD', null),
  },
};

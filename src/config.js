const dotenv = require('dotenv');

dotenv.config();

function requireEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  db: {
    host: requireEnv('DB_HOST', '127.0.0.1'),
    port: Number(process.env.DB_PORT || 3306),
    database: requireEnv('DB_NAME', null),
    user: requireEnv('DB_USER', null),
    password: requireEnv('DB_PASSWORD', null),
  },
};

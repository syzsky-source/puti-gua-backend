require('dotenv').config();

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toNumber(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'puti_gua',
    connectionLimit: toNumber(process.env.DB_CONNECTION_LIMIT, 10)
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  },
  // 新用户首次进入默认赠送 1 次；可通过服务器 .env 的 FREE_POINTS 覆盖。
  freePoints: toNumber(process.env.FREE_POINTS, 1),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  uploadDir: process.env.UPLOAD_DIR || 'uploads/payment_proofs',
  adminToken: process.env.ADMIN_TOKEN || '',
  jwtSecret: process.env.JWT_SECRET || 'change-this-jwt-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d'
};

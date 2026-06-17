const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const { pool } = require('./config/db');
const publicRoutes = require('./routes/public.routes');
const adminRoutes = require('./routes/admin.routes');
const { ok } = require('./utils/response');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

function normalizeOrigin(origin) {
  return String(origin || '').replace(/\/$/, '');
}

const allowAll = env.corsOrigin === '*';
const allowList = env.corsOrigin.split(',').map(s => normalizeOrigin(s.trim())).filter(Boolean);
const defaultAllowList = [
  'https://api.putiguaguan.fun',
  'https://putiguaguan.fun',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  env.publicBaseUrl
].map(normalizeOrigin).filter(Boolean);
const allowedOrigins = new Set([...allowList, ...defaultAllowList]);

app.use(cors({
  origin(origin, cb) {
    const normalized = normalizeOrigin(origin);
    if (allowAll || !origin || allowedOrigins.has(normalized)) return cb(null, true);
    return cb(new Error(`CORS 不允许来源：${origin}`));
  },
  credentials: true
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

function sendAdminPage(req, res) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.putiguaguan.fun https://putiguaguan.fun http://127.0.0.1:3000 http://localhost:3000"
  );
  return res.sendFile(path.resolve(process.cwd(), 'admin.html'));
}

app.get('/admin', sendAdminPage);
app.get('/admin.html', sendAdminPage);

app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    return ok(res, { status: 'ok', service: 'puti-gua-backend' });
  } catch (err) { next(err); }
});

app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`菩提卦馆后端已启动：http://localhost:${env.port}`);
});

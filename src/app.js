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

const corsOptions = {
  // 后台接口仍然依赖 x-admin-token 鉴权；这里放开浏览器来源，避免后台页 POST 预检请求被拦截。
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token', 'Authorization'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src *"
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

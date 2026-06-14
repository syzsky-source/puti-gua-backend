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

const allowAll = env.corsOrigin === '*';
const allowList = env.corsOrigin.split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (allowAll || !origin || allowList.includes(origin)) return cb(null, true);
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

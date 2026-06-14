const { fail } = require('../utils/response');

function notFound(req, res) {
  return fail(res, 404, `接口不存在：${req.method} ${req.originalUrl}`, 404);
}

function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err);
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const code = err.code && Number.isInteger(err.code) ? err.code : status;
  return fail(res, code, err.message || '服务器错误', status);
}

module.exports = { notFound, errorHandler };

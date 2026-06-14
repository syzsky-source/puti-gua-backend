const env = require('../config/env');
const { fail } = require('../utils/response');

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.admin_token;
  if (!env.adminToken || token !== env.adminToken) {
    return fail(res, 401, '管理员权限校验失败', 401);
  }
  return next();
}

module.exports = { adminAuth };

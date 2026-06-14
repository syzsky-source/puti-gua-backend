function ok(res, data = null, msg = 'ok') {
  return res.json({ code: 0, msg, data });
}

function fail(res, code = 500, msg = '服务器错误', status = 200, data = null) {
  return res.status(status).json({ code, msg, data });
}

module.exports = { ok, fail };

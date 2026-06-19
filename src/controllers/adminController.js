const { query, getOne } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { adjustUserPoints } = require('../services/userService');

function parsePage(value, fallback = 1) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : fallback;
}

function parsePageSize(value, fallback = 20) {
  const size = Number.parseInt(value, 10);
  if (!Number.isFinite(size) || size <= 0) return fallback;
  return Math.min(size, 100);
}

function escapeLike(value) {
  return String(value).replace(/[\%_]/g, '\\$&');
}

function money(value) {
  return Number(value || 0);
}

function normalizeNullableText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

async function getUserColumns() {
  const rows = await query('SHOW COLUMNS FROM users');
  return new Set(rows.map(row => row.Field));
}

function pickColumn(columns, candidates) {
  return candidates.find(col => columns.has(col)) || null;
}

function optionalUserFields(columns) {
  const phoneCol = pickColumn(columns, ['phone', 'mobile', 'mobile_phone', 'bind_phone', 'bound_phone']);
  const wechatCol = pickColumn(columns, ['wechat', 'wechat_id', 'wechat_no', 'bind_wechat', 'bound_wechat']);
  return {
    phoneSelect: phoneCol ? `u.\`${phoneCol}\` AS phone` : 'NULL AS phone',
    wechatSelect: wechatCol ? `u.\`${wechatCol}\` AS wechat` : 'NULL AS wechat',
    searchableColumns: ['id', 'nickname', phoneCol, wechatCol].filter(Boolean)
  };
}

function buildUserKeywordWhere(columns, keyword, params) {
  if (!keyword) return '';
  const { searchableColumns } = optionalUserFields(columns);
  const like = `%${escapeLike(keyword)}%`;
  const clauses = searchableColumns.map(col => {
    params.push(like);
    return `u.\`${col}\` LIKE ?`;
  });
  return clauses.length ? `WHERE (${clauses.join(' OR ')})` : '';
}

function buildPagination(req) {
  const page = parsePage(req.query.page, 1);
  const pageSize = parsePageSize(req.query.page_size || req.query.pageSize, 20);
  const offset = (page - 1) * pageSize;
  return { page, page_size: pageSize, offset };
}

async function upsertSetting(key, value, remark = null) {
  await query(
    `INSERT INTO settings (setting_key, setting_value, remark, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), remark = COALESCE(VALUES(remark), remark), updated_at = NOW()`,
    [key, value == null ? '' : String(value), remark]
  );
}

async function getDashboard(req, res, next) {
  try {
    const [todayIncome, totalIncome, userStats, orderStats, aiStats, recentOrders] = await Promise.all([
      getOne(`SELECT COALESCE(SUM(amount), 0) AS value FROM orders WHERE status = 'paid' AND DATE(COALESCE(paid_at, confirmed_at, updated_at, created_at)) = CURDATE()`),
      getOne(`SELECT COALESCE(SUM(amount), 0) AS value FROM orders WHERE status = 'paid'`),
      getOne(`SELECT COUNT(*) AS total_users, SUM(DATE(updated_at) = CURDATE()) AS active_today FROM users`),
      getOne(`SELECT COUNT(*) AS total_orders, SUM(status = 'paid') AS paid_orders, SUM(status = 'pending') AS pending_orders, SUM(status = 'proof_uploaded') AS review_orders, SUM(status = 'paid' AND DATE(COALESCE(paid_at, confirmed_at, updated_at, created_at)) = CURDATE()) AS paid_today FROM orders`),
      getOne(`SELECT COUNT(*) AS history_records, SUM(DATE(created_at) = CURDATE()) AS today_ai_records FROM ai_logs`),
      query(`SELECT o.*, p.name AS product_name FROM orders o LEFT JOIN products p ON p.id = o.product_id ORDER BY o.created_at DESC LIMIT 8`)
    ]);

    return ok(res, {
      today_income: money(todayIncome?.value),
      total_income: money(totalIncome?.value),
      total_users: Number(userStats?.total_users || 0),
      active_today: Number(userStats?.active_today || 0),
      history_records: Number(aiStats?.history_records || 0),
      today_unlocks: Number(aiStats?.today_ai_records || 0),
      total_orders: Number(orderStats?.total_orders || 0),
      paid_orders: Number(orderStats?.paid_orders || 0),
      pending_orders: Number(orderStats?.pending_orders || 0),
      review_orders: Number(orderStats?.review_orders || 0),
      paid_today: Number(orderStats?.paid_today || 0),
      recent_orders: recentOrders
    });
  } catch (err) { next(err); }
}

async function listOrders(req, res, next) {
  try {
    const status = req.query.status;
    const productId = req.query.product_id || req.query.productId;
    const userId = req.query.user_id || req.query.userId;
    const keyword = String(req.query.keyword || req.query.q || '').trim();
    const clauses = [];
    const params = [];
    if (status) { clauses.push('o.status = ?'); params.push(status); }
    if (productId) { clauses.push('o.product_id = ?'); params.push(productId); }
    if (userId) { clauses.push('o.user_id = ?'); params.push(userId); }
    if (keyword) { clauses.push('(o.id LIKE ? OR o.user_id LIKE ? OR o.product_id LIKE ? OR p.name LIKE ?)'); const like = `%${escapeLike(keyword)}%`; params.push(like, like, like, like); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await query(
      `SELECT o.*, p.name AS product_name, p.price AS product_price
       FROM orders o
       LEFT JOIN products p ON p.id = o.product_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT 200`,
      params
    );
    return ok(res, rows);
  } catch (err) { next(err); }
}

async function confirmOrder(req, res, next) {
  try {
    const orderId = req.params.orderId;
    const order = await getOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return fail(res, 404, '订单不存在', 404);
    if (order.status === 'paid') return ok(res, { id: order.id, status: 'paid', msg: '订单已确认过' });
    if (order.status === 'cancelled') return fail(res, 400, '订单已取消，不能确认', 400);

    const updateResult = await query(
      `UPDATE orders
       SET status = 'paid', paid_at = NOW(), confirmed_at = NOW(), updated_at = NOW()
       WHERE id = ? AND status NOT IN ('paid', 'cancelled')`,
      [orderId]
    );
    if (updateResult.affectedRows === 0) {
      const latest = await getOne('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (latest?.status === 'paid') return ok(res, { id: latest.id, status: 'paid', msg: '订单已确认过' });
      return fail(res, 400, '订单状态已变化，不能确认', 400);
    }

    const result = await adjustUserPoints(order.user_id, Number(order.points_count || 0), {
      source: 'order_confirm',
      refId: order.id,
      remark: '后台确认订单自动加次数'
    });
    await query('UPDATE users SET total_paid = total_paid + ?, updated_at = NOW() WHERE id = ?', [order.amount, order.user_id]);

    return ok(res, {
      id: order.id,
      status: 'paid',
      user_id: order.user_id,
      added_points: result.actual_delta,
      user_points_balance: result.user?.points_balance ?? null
    });
  } catch (err) { next(err); }
}

async function cancelOrder(req, res, next) {
  try {
    const orderId = req.params.orderId;
    const order = await getOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return fail(res, 404, '订单不存在', 404);
    if (order.status === 'paid') return fail(res, 400, '已付款订单不能取消', 400);
    await query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', ['cancelled', orderId]);
    return ok(res, { id: orderId, status: 'cancelled' });
  } catch (err) { next(err); }
}

async function listUsers(req, res, next) {
  try {
    const columns = await getUserColumns();
    const { phoneSelect, wechatSelect } = optionalUserFields(columns);
    const { page, page_size, offset } = buildPagination(req);
    const keyword = (req.query.keyword || req.query.q || '').trim();

    const whereParams = [];
    const where = buildUserKeywordWhere(columns, keyword, whereParams);
    const countRows = await query(`SELECT COUNT(*) AS total FROM users u ${where}`, whereParams);
    const total = Number(countRows[0]?.total || 0);

    const rows = await query(
      `SELECT
         u.id,
         u.nickname,
         ${phoneSelect},
         ${wechatSelect},
         u.points_balance,
         u.total_paid,
         u.created_at,
         u.updated_at,
         COALESCE(os.total_orders, 0) AS total_orders,
         COALESCE(os.paid_orders, 0) AS paid_orders,
         COALESCE(os.paid_amount, 0) AS paid_amount,
         os.latest_order_at
       FROM users u
       LEFT JOIN (
         SELECT
           user_id,
           COUNT(*) AS total_orders,
           SUM(status = 'paid') AS paid_orders,
           SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount,
           MAX(created_at) AS latest_order_at
         FROM orders
         GROUP BY user_id
       ) os ON os.user_id = u.id
       ${where}
       ORDER BY u.updated_at DESC, u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...whereParams, page_size, offset]
    );

    return ok(res, { list: rows, page, page_size, total });
  } catch (err) { next(err); }
}

async function getUserDetail(req, res, next) {
  try {
    const userId = req.params.userId;
    const columns = await getUserColumns();
    const { phoneSelect, wechatSelect } = optionalUserFields(columns);

    const user = await getOne(
      `SELECT
         u.id,
         u.nickname,
         ${phoneSelect},
         ${wechatSelect},
         u.points_balance,
         u.total_paid,
         u.created_at,
         u.updated_at
       FROM users u
       WHERE u.id = ?`,
      [userId]
    );
    if (!user) return fail(res, 404, '用户不存在', 404);

    const stats = await getOne(
      `SELECT
         COUNT(*) AS total_orders,
         SUM(status = 'pending') AS pending_orders,
         SUM(status = 'proof_uploaded') AS proof_uploaded_orders,
         SUM(status = 'paid') AS paid_orders,
         SUM(status = 'cancelled') AS cancelled_orders,
         SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount
       FROM orders
       WHERE user_id = ?`,
      [userId]
    );

    const recentOrders = await query(
      `SELECT o.*, p.name AS product_name, p.price AS product_price
       FROM orders o
       LEFT JOIN products p ON p.id = o.product_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [userId]
    );

    return ok(res, { user, stats, recent_orders: recentOrders });
  } catch (err) { next(err); }
}

async function listUserOrders(req, res, next) {
  try {
    const userId = req.params.userId;
    const { page, page_size, offset } = buildPagination(req);
    const status = req.query.status;
    const params = [userId];
    let where = 'WHERE o.user_id = ?';
    if (status) {
      where += ' AND o.status = ?';
      params.push(status);
    }

    const countRows = await query(`SELECT COUNT(*) AS total FROM orders o ${where}`, params);
    const total = Number(countRows[0]?.total || 0);
    const rows = await query(
      `SELECT o.*, p.name AS product_name, p.price AS product_price
       FROM orders o
       LEFT JOIN products p ON p.id = o.product_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, page_size, offset]
    );

    return ok(res, { list: rows, page, page_size, total });
  } catch (err) { next(err); }
}

async function adjustUserPointsById(req, res, next) {
  try {
    const userId = req.params.userId;
    const rawPoints = req.body.delta ?? req.body.points;
    const points = Number(rawPoints);
    if (!Number.isInteger(points) || points === 0) return fail(res, 400, 'points/delta 必须是非 0 整数', 400);

    const result = await adjustUserPoints(userId, points, {
      source: 'admin_manual',
      refId: null,
      remark: req.body.reason || req.body.remark || null
    });
    return ok(res, {
      id: result.user.id,
      old_balance: result.old_balance,
      delta: result.actual_delta,
      points_balance: result.user.points_balance
    });
  } catch (err) { next(err); }
}

async function adjustUserPointsLegacy(req, res, next) {
  try {
    const { user_id } = req.body;
    const rawPoints = req.body.delta ?? req.body.points;
    const points = Number(rawPoints);
    if (!user_id || !Number.isInteger(points) || points === 0) return fail(res, 400, 'user_id 和 points/delta 必填，且 points/delta 必须是非 0 整数', 400);

    const result = await adjustUserPoints(user_id, points, {
      source: 'admin_manual',
      refId: null,
      remark: req.body.reason || req.body.remark || null
    });
    return ok(res, {
      id: result.user.id,
      old_balance: result.old_balance,
      delta: result.actual_delta,
      points_balance: result.user.points_balance
    });
  } catch (err) { next(err); }
}

async function listProducts(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, name, emoji, price, points_count, description, sort_order, is_active, created_at, updated_at
       FROM products
       ORDER BY sort_order ASC, price ASC, created_at DESC`
    );
    return ok(res, rows);
  } catch (err) { next(err); }
}

async function saveProduct(req, res, next) {
  try {
    const id = String(req.params.productId || req.body.id || '').trim();
    if (!id) return fail(res, 400, '商品 id 必填，例如 p_9_10', 400);
    const existing = await getOne('SELECT * FROM products WHERE id = ?', [id]);
    const name = req.body.name ?? existing?.name;
    const price = req.body.price ?? existing?.price;
    const pointsCount = req.body.points_count ?? req.body.pointsCount ?? existing?.points_count;
    if (!name || price == null || pointsCount == null) return fail(res, 400, 'name、price、points_count 必填', 400);
    const emoji = req.body.emoji ?? existing?.emoji ?? '';
    const description = req.body.description ?? existing?.description ?? '';
    const sortOrder = Number(req.body.sort_order ?? req.body.sortOrder ?? existing?.sort_order ?? 0);
    const isActive = Number(req.body.is_active ?? req.body.isActive ?? existing?.is_active ?? 1) ? 1 : 0;

    await query(
      `INSERT INTO products (id, name, emoji, price, points_count, description, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE name = VALUES(name), emoji = VALUES(emoji), price = VALUES(price), points_count = VALUES(points_count), description = VALUES(description), sort_order = VALUES(sort_order), is_active = VALUES(is_active), updated_at = NOW()`,
      [id, name, emoji, Number(price), Number(pointsCount), description, sortOrder, isActive]
    );
    const product = await getOne('SELECT * FROM products WHERE id = ?', [id]);
    return ok(res, product);
  } catch (err) { next(err); }
}

async function listQrCodes(req, res, next) {
  try {
    const rows = await query(`SELECT q.*, p.name AS product_name FROM qrcodes q LEFT JOIN products p ON p.id = q.product_id ORDER BY q.is_active DESC, q.product_id IS NULL ASC, q.amount ASC, q.updated_at DESC, q.id DESC`);
    return ok(res, rows);
  } catch (err) { next(err); }
}

async function saveQrCode(req, res, next) {
  try {
    const id = req.params.qrcodeId;
    const name = req.body.name || '收款码';
    const accountName = req.body.account_name || req.body.accountName || '';
    const imageUrl = req.body.image_url || req.body.imageUrl || '';
    const remark = req.body.remark || '';
    const productId = normalizeNullableText(req.body.product_id ?? req.body.productId);
    const amount = req.body.amount == null || req.body.amount === '' ? null : Number(req.body.amount);
    const isActive = Number(req.body.is_active ?? req.body.isActive ?? 0) ? 1 : 0;

    if (productId) {
      const product = await getOne('SELECT id, price FROM products WHERE id = ?', [productId]);
      if (!product) return fail(res, 400, '绑定套餐不存在', 400);
    }

    if (id) {
      await query('UPDATE qrcodes SET name = ?, account_name = ?, image_url = ?, remark = ?, product_id = ?, amount = ?, is_active = ?, updated_at = NOW() WHERE id = ?', [name, accountName, imageUrl, remark, productId, amount, isActive, id]);
      return ok(res, await getOne('SELECT * FROM qrcodes WHERE id = ?', [id]));
    }

    const result = await query(
      'INSERT INTO qrcodes (name, account_name, image_url, remark, product_id, amount, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [name, accountName, imageUrl, remark, productId, amount, isActive]
    );
    return ok(res, await getOne('SELECT * FROM qrcodes WHERE id = ?', [result.insertId]));
  } catch (err) { next(err); }
}

async function activateQrCode(req, res, next) {
  try {
    const id = req.params.qrcodeId;
    const row = await getOne('SELECT * FROM qrcodes WHERE id = ?', [id]);
    if (!row) return fail(res, 404, '收款码不存在', 404);
    await query('UPDATE qrcodes SET is_active = 1, updated_at = NOW() WHERE id = ?', [id]);
    return ok(res, await getOne('SELECT * FROM qrcodes WHERE id = ?', [id]));
  } catch (err) { next(err); }
}

async function listSettings(req, res, next) {
  try {
    const rows = await query('SELECT setting_key, setting_value, remark, updated_at FROM settings ORDER BY setting_key ASC');
    const map = {};
    for (const row of rows) map[row.setting_key] = row.setting_value;
    return ok(res, { list: rows, map });
  } catch (err) { next(err); }
}

async function updateSetting(req, res, next) {
  try {
    const key = req.params.key;
    if (!key) return fail(res, 400, 'setting key 必填', 400);
    const value = req.body.setting_value ?? req.body.value ?? '';
    await upsertSetting(key, value, req.body.remark || null);
    return ok(res, await getOne('SELECT setting_key, setting_value, remark, updated_at FROM settings WHERE setting_key = ?', [key]));
  } catch (err) { next(err); }
}

async function getMusicConfig(req, res, next) {
  try {
    const rows = await query("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('music_enabled','music_title','music_url','music_volume')");
    const map = { music_enabled: '0', music_title: '', music_url: '', music_volume: '60' };
    for (const row of rows) map[row.setting_key] = row.setting_value;
    return ok(res, map);
  } catch (err) { next(err); }
}

async function updateMusicConfig(req, res, next) {
  try {
    const items = {
      music_enabled: req.body.music_enabled ?? req.body.enabled,
      music_title: req.body.music_title ?? req.body.title,
      music_url: req.body.music_url ?? req.body.url,
      music_volume: req.body.music_volume ?? req.body.volume
    };
    for (const [key, value] of Object.entries(items)) {
      if (value !== undefined) await upsertSetting(key, value, '禅修音乐配置');
    }
    return getMusicConfig(req, res, next);
  } catch (err) { next(err); }
}

async function getSecurityStatus(req, res, next) {
  try {
    const admins = await query('SELECT id, username, role, is_active, created_at, updated_at FROM admin_users ORDER BY id ASC LIMIT 20');
    return ok(res, {
      auth_mode: 'ADMIN_TOKEN',
      token_required: true,
      password_login_ready: admins.length > 0,
      admins
    });
  } catch (err) { next(err); }
}

async function listAuditLogs(req, res, next) {
  try {
    let pointLogs = [];
    let aiLogs = [];
    try {
      pointLogs = await query('SELECT id, user_id, delta, old_balance, new_balance, source, ref_id, remark, created_at FROM user_point_logs ORDER BY created_at DESC LIMIT 80');
    } catch (err) {
      pointLogs = [];
    }
    try {
      aiLogs = await query('SELECT id, user_id, model, created_at FROM ai_logs ORDER BY created_at DESC LIMIT 80');
    } catch (err) {
      aiLogs = [];
    }
    return ok(res, { point_logs: pointLogs, ai_logs: aiLogs });
  } catch (err) { next(err); }
}

module.exports = {
  getDashboard,
  listOrders,
  confirmOrder,
  cancelOrder,
  listUsers,
  getUserDetail,
  listUserOrders,
  adjustUserPointsById,
  adjustUserPoints: adjustUserPointsLegacy,
  listProducts,
  saveProduct,
  listQrCodes,
  saveQrCode,
  activateQrCode,
  listSettings,
  updateSetting,
  getMusicConfig,
  updateMusicConfig,
  getSecurityStatus,
  listAuditLogs
};

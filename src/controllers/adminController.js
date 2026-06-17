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
  return String(value).replace(/[\\%_]/g, '\\$&');
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

async function listOrders(req, res, next) {
  try {
    const status = req.query.status;
    const params = [];
    let where = '';
    if (status) {
      where = 'WHERE o.status = ?';
      params.push(status);
    }
    const rows = await query(
      `SELECT o.*, p.name AS product_name
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
      `SELECT o.*, p.name AS product_name
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
      `SELECT o.*, p.name AS product_name
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

module.exports = {
  listOrders,
  confirmOrder,
  cancelOrder,
  listUsers,
  getUserDetail,
  listUserOrders,
  adjustUserPointsById,
  adjustUserPoints: adjustUserPointsLegacy
};

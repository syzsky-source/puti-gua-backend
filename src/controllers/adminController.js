const { query, getOne } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { addUserPoints } = require('../services/userService');

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

    await addUserPoints(order.user_id, Number(order.points_count || 0));
    await query(
      `UPDATE orders
       SET status = 'paid', paid_at = NOW(), confirmed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [orderId]
    );

    const user = await getOne('SELECT id, points_balance FROM users WHERE id = ?', [order.user_id]);
    return ok(res, {
      id: order.id,
      status: 'paid',
      user_id: order.user_id,
      added_points: Number(order.points_count || 0),
      user_points_balance: user?.points_balance ?? null
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

async function adjustUserPoints(req, res, next) {
  try {
    const { user_id, points } = req.body;
    if (!user_id || !Number.isFinite(Number(points))) return fail(res, 400, 'user_id 和 points 必填', 400);
    const user = await addUserPoints(user_id, Number(points));
    return ok(res, { id: user.id, points_balance: user.points_balance });
  } catch (err) { next(err); }
}

module.exports = { listOrders, confirmOrder, cancelOrder, adjustUserPoints };

const { pool, getOne, query } = require('../config/db');
const env = require('../config/env');

function assertValidUserId(userId) {
  if (!userId || typeof userId !== 'string' || userId.length > 128) {
    const err = new Error('user_id 不合法');
    err.status = 400;
    throw err;
  }
}

function assertValidPoints(points) {
  const delta = Number(points);
  if (!Number.isInteger(delta)) {
    const err = new Error('points 必须是整数');
    err.status = 400;
    throw err;
  }
  return delta;
}

async function getOrCreateUser(userId) {
  assertValidUserId(userId);

  let user = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (user) return user;

  await query(
    'INSERT INTO users (id, points_balance, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
    [userId, env.freePoints]
  );
  user = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
  return user;
}

async function insertPointLog(conn, { userId, delta, oldBalance, newBalance, source, refId, remark }) {
  try {
    await conn.query(
      `INSERT INTO user_point_logs
       (user_id, delta, old_balance, new_balance, source, ref_id, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, delta, oldBalance, newBalance, source, refId, remark]
    );
  } catch (err) {
    // 兼容已上线旧库：如果还没导入 user_point_logs 表，不影响核心加减次数。
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_TABLE_ERROR')) return;
    throw err;
  }
}

async function adjustUserPoints(userId, points, options = {}) {
  assertValidUserId(userId);
  const delta = assertValidPoints(points);

  const source = options.source || 'manual';
  const refId = options.refId || null;
  const remark = options.remark || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    let user = existingRows[0];
    if (!user) {
      await conn.query(
        'INSERT INTO users (id, points_balance, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [userId, env.freePoints]
      );
      const [createdRows] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
      user = createdRows[0];
    }

    const oldBalance = Number(user.points_balance || 0);
    const newBalance = Math.max(oldBalance + delta, 0);
    const actualDelta = newBalance - oldBalance;

    await conn.query(
      'UPDATE users SET points_balance = ?, updated_at = NOW() WHERE id = ?',
      [newBalance, userId]
    );

    await insertPointLog(conn, {
      userId,
      delta: actualDelta,
      oldBalance,
      newBalance,
      source,
      refId,
      remark
    });

    await conn.commit();
    const latest = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
    return { user: latest, old_balance: oldBalance, new_balance: newBalance, actual_delta: actualDelta };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function addUserPoints(userId, points, options = {}) {
  const result = await adjustUserPoints(userId, points, options);
  return result.user;
}

async function decrementUserPoint(userId) {
  const result = await adjustUserPoints(userId, -1, { source: 'ai_chat' });
  return result.user;
}

module.exports = { getOrCreateUser, addUserPoints, adjustUserPoints, decrementUserPoint };

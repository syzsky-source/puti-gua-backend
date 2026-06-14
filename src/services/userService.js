const { getOne, query } = require('../config/db');
const env = require('../config/env');

async function getOrCreateUser(userId) {
  if (!userId || typeof userId !== 'string' || userId.length > 128) {
    const err = new Error('user_id 不合法');
    err.status = 400;
    throw err;
  }

  let user = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (user) return user;

  await query(
    'INSERT INTO users (id, points_balance, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
    [userId, env.freePoints]
  );
  user = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
  return user;
}

async function addUserPoints(userId, points) {
  await getOrCreateUser(userId);
  await query('UPDATE users SET points_balance = points_balance + ?, updated_at = NOW() WHERE id = ?', [points, userId]);
  return getOne('SELECT * FROM users WHERE id = ?', [userId]);
}

async function decrementUserPoint(userId) {
  await query('UPDATE users SET points_balance = GREATEST(points_balance - 1, 0), updated_at = NOW() WHERE id = ?', [userId]);
  return getOne('SELECT * FROM users WHERE id = ?', [userId]);
}

module.exports = { getOrCreateUser, addUserPoints, decrementUserPoint };

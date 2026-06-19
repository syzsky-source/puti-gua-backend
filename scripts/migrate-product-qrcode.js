/*
 * 安全迁移：规范三档套餐并绑定对应收款码。
 * 正确套餐：10次 / 19.90，30次 / 29.90，100次 / 69.90。
 * 可重复执行：字段、索引、套餐和套餐二维码均会按需新增或更新。
 * 执行：node scripts/migrate-product-qrcode.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const db = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'puti_gua'
};

const packageRows = [
  {
    id: 'p_9_10',
    name: '10次问卦',
    emoji: '📿',
    price: 19.90,
    points: 10,
    description: '入门体验套餐',
    sortOrder: 1,
    imageUrl: 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_19_90.jpg',
    qrName: '19.90套餐收款码',
    qrRemark: '自动匹配10次问卦套餐'
  },
  {
    id: 'p_19_30',
    name: '30次问卦',
    emoji: '🔮',
    price: 29.90,
    points: 30,
    description: '常用体验套餐',
    sortOrder: 2,
    imageUrl: 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_29_90.jpg',
    qrName: '29.90套餐收款码',
    qrRemark: '自动匹配30次问卦套餐'
  },
  {
    id: 'p_49_100',
    name: '100次问卦',
    emoji: '🏮',
    price: 69.90,
    points: 100,
    description: '长期使用套餐',
    sortOrder: 3,
    imageUrl: 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_69_90.jpg',
    qrName: '69.90套餐收款码',
    qrRemark: '自动匹配100次问卦套餐'
  }
];

async function columnExists(connection, columnName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'qrcodes' AND COLUMN_NAME = ?
     LIMIT 1`,
    [db.database, columnName]
  );
  return rows.length > 0;
}

async function indexExists(connection, indexName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'qrcodes' AND INDEX_NAME = ?
     LIMIT 1`,
    [db.database, indexName]
  );
  return rows.length > 0;
}

async function ensureQrSchema(connection) {
  if (!(await columnExists(connection, 'product_id'))) {
    await connection.query('ALTER TABLE qrcodes ADD COLUMN product_id VARCHAR(64) NULL AFTER remark');
    console.log('已新增 qrcodes.product_id');
  } else {
    console.log('qrcodes.product_id 已存在，跳过');
  }

  if (!(await columnExists(connection, 'amount'))) {
    await connection.query('ALTER TABLE qrcodes ADD COLUMN amount DECIMAL(10,2) NULL AFTER product_id');
    console.log('已新增 qrcodes.amount');
  } else {
    console.log('qrcodes.amount 已存在，跳过');
  }

  if (!(await indexExists(connection, 'idx_qrcodes_product_active'))) {
    await connection.query('ALTER TABLE qrcodes ADD INDEX idx_qrcodes_product_active (product_id, is_active)');
    console.log('已新增索引 idx_qrcodes_product_active');
  }

  if (!(await indexExists(connection, 'idx_qrcodes_amount_active'))) {
    await connection.query('ALTER TABLE qrcodes ADD INDEX idx_qrcodes_amount_active (amount, is_active)');
    console.log('已新增索引 idx_qrcodes_amount_active');
  }
}

async function findReusableQrCode(connection, item) {
  const [rows] = await connection.query(
    `SELECT id
     FROM qrcodes
     WHERE product_id = ? OR image_url = ?
     ORDER BY CASE WHEN product_id = ? THEN 0 WHEN image_url = ? THEN 1 ELSE 2 END, id ASC
     LIMIT 1`,
    [item.id, item.imageUrl, item.id, item.imageUrl]
  );
  return rows[0] || null;
}

async function seedPackagesAndQrCodes(connection) {
  const canonicalIds = packageRows.map(item => item.id);
  const placeholders = canonicalIds.map(() => '?').join(', ');

  // 只保留正确的三档套餐为上架状态，历史订单不会受影响。
  const [deactivatedProducts] = await connection.query(
    `UPDATE products SET is_active = 0, updated_at = NOW()
     WHERE id NOT IN (${placeholders}) AND is_active <> 0`,
    canonicalIds
  );
  console.log(`已下架非标准套餐：${deactivatedProducts.affectedRows} 条`);

  // 先停用旧套餐绑定的二维码，随后只启用这三张正确二维码。
  await connection.query('UPDATE qrcodes SET is_active = 0, updated_at = NOW() WHERE product_id IS NOT NULL');

  for (const item of packageRows) {
    await connection.query(
      `INSERT INTO products
       (id, name, emoji, price, points_count, description, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), emoji = VALUES(emoji), price = VALUES(price),
         points_count = VALUES(points_count), description = VALUES(description),
         sort_order = VALUES(sort_order), is_active = 1, updated_at = NOW()`,
      [item.id, item.name, item.emoji, item.price, item.points, item.description, item.sortOrder]
    );

    const reusable = await findReusableQrCode(connection, item);
    if (reusable) {
      await connection.query(
        `UPDATE qrcodes
         SET name = ?, account_name = '菩提卦馆', image_url = ?, remark = ?,
             product_id = ?, amount = ?, is_active = 1, updated_at = NOW()
         WHERE id = ?`,
        [item.qrName, item.imageUrl, item.qrRemark, item.id, item.price, reusable.id]
      );
      await connection.query('UPDATE qrcodes SET is_active = 0 WHERE product_id = ? AND id <> ?', [item.id, reusable.id]);
      console.log(`已更新 ${item.name} / ¥${item.price.toFixed(2)} 对应收款码`);
    } else {
      await connection.query(
        `INSERT INTO qrcodes
         (name, account_name, image_url, remark, product_id, amount, is_active, created_at, updated_at)
         VALUES (?, '菩提卦馆', ?, ?, ?, ?, 1, NOW(), NOW())`,
        [item.qrName, item.imageUrl, item.qrRemark, item.id, item.price]
      );
      console.log(`已新增 ${item.name} / ¥${item.price.toFixed(2)} 对应收款码`);
    }
  }
}

async function main() {
  const connection = await mysql.createConnection(db);
  try {
    console.log(`连接数据库：${db.database}`);
    await ensureQrSchema(connection);
    await seedPackagesAndQrCodes(connection);
    console.log('迁移完成。');
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error('迁移失败：', err.message);
  process.exit(1);
});

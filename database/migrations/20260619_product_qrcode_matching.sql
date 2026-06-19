USE puti_gua;

ALTER TABLE qrcodes
  ADD COLUMN product_id VARCHAR(64) NULL AFTER remark,
  ADD COLUMN amount DECIMAL(10,2) NULL AFTER product_id,
  ADD INDEX idx_qrcodes_product_active (product_id, is_active),
  ADD INDEX idx_qrcodes_amount_active (amount, is_active);

-- 正确套餐：10次 / 19.90，30次 / 29.90，100次 / 69.90。
UPDATE products
SET is_active = 0, updated_at = NOW()
WHERE id NOT IN ('p_9_10', 'p_19_30', 'p_49_100');

INSERT INTO products (id, name, emoji, price, points_count, description, sort_order, is_active, created_at, updated_at)
VALUES
('p_9_10', '10次问卦', '📿', 19.90, 10, '入门体验套餐', 1, 1, NOW(), NOW()),
('p_19_30', '30次问卦', '🔮', 29.90, 30, '常用体验套餐', 2, 1, NOW(), NOW()),
('p_49_100', '100次问卦', '🏮', 69.90, 100, '长期使用套餐', 3, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
name = VALUES(name), emoji = VALUES(emoji), price = VALUES(price), points_count = VALUES(points_count),
description = VALUES(description), sort_order = VALUES(sort_order), is_active = VALUES(is_active), updated_at = NOW();

-- 本文件用于首次数据库迁移。线上已有数据库请优先执行：node scripts/migrate-product-qrcode.js
INSERT INTO qrcodes (name, account_name, image_url, remark, product_id, amount, is_active, created_at, updated_at)
VALUES
('19.90套餐收款码', '菩提卦馆', 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_19_90.jpg', '自动匹配10次问卦套餐', 'p_9_10', 19.90, 1, NOW(), NOW()),
('29.90套餐收款码', '菩提卦馆', 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_29_90.jpg', '自动匹配30次问卦套餐', 'p_19_30', 29.90, 1, NOW(), NOW()),
('69.90套餐收款码', '菩提卦馆', 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_69_90.jpg', '自动匹配100次问卦套餐', 'p_49_100', 69.90, 1, NOW(), NOW());

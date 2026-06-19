USE puti_gua;

ALTER TABLE qrcodes
  ADD COLUMN product_id VARCHAR(64) NULL AFTER remark,
  ADD COLUMN amount DECIMAL(10,2) NULL AFTER product_id,
  ADD INDEX idx_qrcodes_product_active (product_id, is_active),
  ADD INDEX idx_qrcodes_amount_active (amount, is_active);

UPDATE products SET name = '30次问卦', price = 19.90, points_count = 30, description = '常用体验套餐', sort_order = 1, is_active = 1, updated_at = NOW() WHERE id = 'p_19_30';

INSERT INTO products (id, name, emoji, price, points_count, description, sort_order, is_active, created_at, updated_at)
VALUES
('p_29_50', '50次问卦', '🔮', 29.90, 50, '进阶常用套餐', 2, 1, NOW(), NOW()),
('p_69_150', '150次问卦', '🏮', 69.90, 150, '长期使用套餐', 3, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
name = VALUES(name), emoji = VALUES(emoji), price = VALUES(price), points_count = VALUES(points_count),
description = VALUES(description), sort_order = VALUES(sort_order), is_active = VALUES(is_active), updated_at = NOW();

INSERT INTO qrcodes (name, account_name, image_url, remark, product_id, amount, is_active, created_at, updated_at)
VALUES
('19.90套餐收款码', '菩提卦馆', 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_19_90.jpg', '自动匹配19.90套餐', 'p_19_30', 19.90, 1, NOW(), NOW()),
('29.90套餐收款码', '菩提卦馆', 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_29_90.jpg', '自动匹配29.90套餐', 'p_29_50', 29.90, 1, NOW(), NOW()),
('69.90套餐收款码', '菩提卦馆', 'https://api.putiguaguan.fun/uploads/qrcodes/qrcode_69_90.jpg', '自动匹配69.90套餐', 'p_69_150', 69.90, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at = NOW();

CREATE DATABASE IF NOT EXISTS puti_gua DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE puti_gua;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY,
  nickname VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  wechat VARCHAR(100) NULL,
  points_balance INT NOT NULL DEFAULT 0,
  total_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_users_phone (phone),
  INDEX idx_users_wechat (wechat),
  INDEX idx_users_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  emoji VARCHAR(16) NULL,
  price DECIMAL(10,2) NOT NULL,
  points_count INT NOT NULL,
  description VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qrcodes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  account_name VARCHAR(100) NULL,
  image_url VARCHAR(500) NULL,
  remark VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NULL,
  remark VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  points_count INT NOT NULL,
  status ENUM('pending','proof_uploaded','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
  proof_image_url VARCHAR(500) NULL,
  paid_at DATETIME NULL,
  confirmed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_orders_user_id (user_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created_at (created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_point_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(128) NOT NULL,
  delta INT NOT NULL,
  old_balance INT NOT NULL,
  new_balance INT NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  ref_id VARCHAR(100) NULL,
  remark VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_user_point_logs_user_id (user_id),
  INDEX idx_user_point_logs_created_at (created_at),
  CONSTRAINT fk_user_point_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_logs (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  system_prompt TEXT NULL,
  messages_json JSON NULL,
  response_text MEDIUMTEXT NULL,
  model VARCHAR(100) NULL,
  prompt_tokens INT NULL,
  completion_tokens INT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_ai_logs_user_id (user_id),
  INDEX idx_ai_logs_created_at (created_at),
  CONSTRAINT fk_ai_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO products (id, name, emoji, price, points_count, description, sort_order, is_active, created_at, updated_at)
VALUES
('p_9_10', '10次问卦', '📿', 9.90, 10, '适合初次体验', 1, 1, NOW(), NOW()),
('p_19_30', '30次问卦', '🔮', 19.90, 30, '常用推荐', 2, 1, NOW(), NOW()),
('p_49_100', '100次问卦', '🏮', 49.90, 100, '长期使用更划算', 3, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
name = VALUES(name), emoji = VALUES(emoji), price = VALUES(price), points_count = VALUES(points_count),
description = VALUES(description), sort_order = VALUES(sort_order), is_active = VALUES(is_active), updated_at = NOW();

INSERT INTO settings (setting_key, setting_value, remark, created_at, updated_at)
VALUES
('customer_wechat', 'puti_gua', '客服微信号', NOW(), NOW()),
('pay_timeout_minutes', '15', '订单支付提示超时时间', NOW(), NOW()),
('site_name', '菩提卦馆', '网站名称', NOW(), NOW())
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), remark = VALUES(remark), updated_at = NOW();

INSERT INTO qrcodes (name, account_name, image_url, remark, is_active, created_at, updated_at)
SELECT '默认收款码', '菩提卦馆', '', '请在后台或数据库中把 image_url 改成你的收款码图片地址', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM qrcodes WHERE is_active = 1);

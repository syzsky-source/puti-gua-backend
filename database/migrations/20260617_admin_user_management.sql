USE puti_gua;

-- 新库可直接导入 database/schema.sql；已上线旧库可按需执行下面语句。
-- 如果某一列已存在，重复执行对应 ALTER 会报 Duplicate column，可跳过该条继续执行后续语句。

ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL AFTER nickname;
ALTER TABLE users ADD COLUMN wechat VARCHAR(100) NULL AFTER phone;
ALTER TABLE users ADD INDEX idx_users_phone (phone);
ALTER TABLE users ADD INDEX idx_users_wechat (wechat);
ALTER TABLE users ADD INDEX idx_users_updated_at (updated_at);

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

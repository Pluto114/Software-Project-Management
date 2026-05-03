-- AquaIntelligence 业务数据库初始化
-- MySQL 8.0

CREATE DATABASE IF NOT EXISTS aqua_intelligence
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aqua_intelligence;

-- 养殖池
CREATE TABLE IF NOT EXISTS pool (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  pool_code   VARCHAR(16)  NOT NULL UNIQUE COMMENT '池号, e.g. P01',
  base_name   VARCHAR(32)  NOT NULL COMMENT '基地名称',
  breed       VARCHAR(32)  NOT NULL COMMENT '养殖鱼种',
  fish_count  INT          NOT NULL DEFAULT 0 COMMENT '存池数量',
  area_sqm    DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '面积(m²)',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 设备
CREATE TABLE IF NOT EXISTS device (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  device_code VARCHAR(24)  NOT NULL UNIQUE COMMENT '设备编号',
  device_name VARCHAR(64)  NOT NULL COMMENT '设备名称',
  device_type ENUM('aerator','feeder','pump','sensor') NOT NULL COMMENT '设备类型',
  pool_id     INT          NULL COMMENT '所属养殖池',
  status      ENUM('online','offline','maintenance','error') NOT NULL DEFAULT 'offline',
  metadata    JSON         NULL COMMENT '扩展属性',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES pool(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 告警记录
CREATE TABLE IF NOT EXISTS alert (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  pool_id     INT          NOT NULL,
  level       ENUM('green','yellow','red') NOT NULL DEFAULT 'green',
  rule_name   VARCHAR(64)  NOT NULL COMMENT '触发规则',
  message     TEXT         NOT NULL,
  sensor_type VARCHAR(16)  NULL COMMENT '关联传感器类型',
  sensor_value DECIMAL(8,3) NULL,
  threshold   DECIMAL(8,3) NULL,
  ai_predicted BOOLEAN     NOT NULL DEFAULT FALSE COMMENT '是否AI预测告警',
  handled     BOOLEAN     NOT NULL DEFAULT FALSE COMMENT '是否已处置',
  handled_at  TIMESTAMP    NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES pool(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 指令日志
CREATE TABLE IF NOT EXISTS command_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  device_id   INT          NOT NULL,
  cmd_type    VARCHAR(32)  NOT NULL COMMENT '指令类型',
  cmd_payload JSON         NOT NULL COMMENT '指令载荷',
  hmac_sign   VARCHAR(128) NULL COMMENT 'HMAC签名',
  status      ENUM('pending','sent','executed','failed','rejected') NOT NULL DEFAULT 'pending',
  result      JSON         NULL COMMENT '执行结果',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP    NULL,
  FOREIGN KEY (device_id) REFERENCES device(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 种子数据
INSERT IGNORE INTO pool (pool_code, base_name, breed, fish_count, area_sqm) VALUES
  ('P01', 'A基地', '石斑鱼',   12000, 500.00),
  ('P02', 'A基地', '石斑鱼',   10500, 500.00),
  ('P03', 'A基地', '珍珠龙胆',  8000, 500.00),
  ('P04', 'B基地', '东星斑',   15000, 650.00),
  ('P05', 'B基地', '老虎斑',    9200, 650.00);

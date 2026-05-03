-- ============================================================
-- 时序数据与聚合表
-- 数据库：InfluxDB (超大规模时序历史数据)
--        MySQL (小时聚合数据永久保留, 需求文档 4.6.2)
-- ============================================================

-- TODO: InfluxDB Bucket: sensor_data
--   measurement: sensor_readings
--   tags: pool_id, sensor_id, sensor_type
--   fields: value, unit, quality (raw/filtered)
--   retention: 30d (高频原始数据)

-- TODO: InfluxDB Bucket: ai_predictions
--   measurement: do_forecasts
--   tags: pool_id, model_version
--   fields: predicted_value, lower_bound, upper_bound, confidence
--   retention: 90d

-- TODO: MySQL 小时聚合表 (sensor_readings_hourly)
--   用于永久保留的聚合数据，支持 AI 模型迭代训练
--   id, pool_id, sensor_type, avg_value, min_value, max_value, stddev, sample_count, hour_bucket, created_at
--   INDEX: (pool_id, sensor_type, hour_bucket)

-- TODO: MySQL 日聚合表 (sensor_readings_daily)
--   id, pool_id, sensor_type, avg_value, min_value, max_value, stddev, sample_count, date, created_at

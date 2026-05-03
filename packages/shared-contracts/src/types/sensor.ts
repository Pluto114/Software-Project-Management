/**
 * 传感器数据类型定义
 *
 * 职责：跨服务（edge -> realtime-hub -> telemetry -> frontend）统一数据结构
 */

// TODO: 定义 SensorReading 接口
//   sensorId: string, poolId: string, timestamp: number (纳秒),
//   type: SensorType (DO|pH|TEMP|ORP|NH3N|CONDUCTIVITY),
//   value: number, unit: string, quality: number (0-1 数据质量),
//   rawValue: number (原始寄存器值)

// TODO: 定义 SensorType 枚举
// TODO: 定义 SensorStatus 枚举 (ONLINE/DEGRADED/UNTRUSTED/OFFLINE)
// TODO: 定义 SensorConfig 接口（modbus_addr, calibration_offset, alarm_thresholds）
// TODO: 定义 SensorPosition 接口（x, y, z 3D坐标）

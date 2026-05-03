/**
 * 控制指令类型定义
 *
 * 职责：定义云端 -> 边缘网关的控制指令结构
 */

// TODO: 定义 CommandFrame 接口
//   header: 0xAA55 (固定帧头)
//   timestamp: number (纳秒 Unix)
//   deviceId: string (4字节网关ID)
//   payloadType: 0x02 (控制指令)
//   command: CommandType (AERATOR_ON/OFF/SPEED, FEEDER_ON/OFF, PUMP_ON/OFF)
//   params: CommandParams (目标值等)
//   nonce: string (64位随机数，防重放)
//   signature: string (HMAC-SHA256 签名，32字节)

// TODO: 定义 CommandType 枚举
// TODO: 定义 CommandStatus 枚举 (PENDING/SENT/GATEWAY_ACK/EXECUTED/FAILED/TIMEOUT)
// TODO: 定义 CommandFeedback 接口 (ACK/NACK 响应结构)
// TODO: 定义 AckFrame 接口 (硬件执行反馈帧结构)

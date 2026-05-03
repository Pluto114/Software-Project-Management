/**
 * 指令下发控制器
 *
 * API:
 * - POST /api/v1/control/command  — 下发单次控制指令
 * - POST /api/v1/control/rules    — 配置 AI 自动控制阈值（需求文档 6.3.1）
 * - GET  /api/v1/control/status   — 查询指令执行状态
 */

// TODO: 实现 command 下发接口（参数：设备ID、指令类型、目标值）
// TODO: 实现 rules 配置接口（阈值、生效时间范围）
// TODO: 实现指令状态追踪（pending -> gateway_ack -> executed -> feedback）
// TODO: 实现双向确认机制（ACK/NACK，需求文档 6.4）

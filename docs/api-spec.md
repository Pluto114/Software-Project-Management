# AquaIntelligence API 规范

## RESTful API

### 历史数据
- `GET /api/v1/assets/history` — 调取 InfluxDB 历史环境数据
- `GET /api/v1/assets/realtime` — 获取 Redis 最新实时快照

### AI 预测
- `GET /api/v1/ai/predictions` — 获取 AI 未来 6h 风险预测报告
- `POST /api/v1/ai/predict` — 提交数据实时预测

### 控制指令
- `POST /api/v1/control/command` — 下发单次控制指令
- `POST /api/v1/control/rules` — 配置 AI 自动控制阈值
- `GET /api/v1/control/status/{id}` — 查询指令执行状态

### 告警
- `GET /api/v1/alerts` — 查询告警历史
- `POST /api/v1/alerts/{id}/confirm` — 确认/处理告警

## WebSocket 私有协议

### 帧类型
| 类型 | 值 | 方向 | 说明 |
|------|-----|------|------|
| 实时数据 | 0x01 | 网关 -> 云端 | 传感器采样数据 |
| 控制指令 | 0x02 | 云端 -> 网关 | 设备控制命令 |
| 心跳 | 0x03 | 双向 | 连接存活性检测 |
| 确认 | 0x04 | 双向 | ACK/NACK 反馈 |

## 认证
- OAuth 2.0 + JWT，Token 有效期 2h，支持无感刷新
- WebSocket 连接时通过 query string 传递 JWT

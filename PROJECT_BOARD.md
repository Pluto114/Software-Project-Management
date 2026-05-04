# AquaIntelligence 项目任务看板

> 高价值水产全生命周期数字孪生平台
> 团队：翁晨昊(PM)、赵杰瑞(Backend)、陈鹏翔(Frontend)、王涵哲(Hardware)
> 交付日：2026-04-14

## 阶段一完成 · 2026-05-04

**已完成 12/17 GitHub Issues，前端后端核心链路全线贯通。**

| 层 | 交付物 | 状态 |
|---|--------|------|
| 前端 | 3D 数字孪生指挥舱 + AI 分析页 + CEO 看板 | ✅ 可独立演示 |
| 后端 | realtime-hub / telemetry / control / rule-engine | ✅ 微服务集群 |
| 设施 | Docker Compose (Redis+MySQL+InfluxDB) | ✅ 一键启动 |
| 工具 | 传感器数据模拟器 | ✅ 模拟边缘网关 |
| 管理 | GitHub Issues Kanban 看板 (17 Issues, 13 labels) | ✅ |

**启动方式:**
```bash
# 基础设施
docker compose -f docker-compose.dev.yml up -d

# 前端 (port 5173)
cd apps/command-center-web && npm run dev

# 后端微服务
cd services/realtime-hub && npm run dev        # port 3001
cd services/telemetry-service && npm run dev   # port 3002
cd services/control-service && npm run dev     # port 3003
cd services/rule-engine-service && npm run dev # port 3004

# 数据模拟器 (填充真实数据流)
npx tsx tools/dev-scripts/sensor-simulator.ts
```

**数据链路:** sensor-simulator → WebSocket(3001) → Redis → telemetry(3002) → InfluxDB → REST API → 前端

---

## 看板说明

每个任务用 GitHub Issue 标签标记：
- `P0` 核心阻塞项 | `P1` 高优先级 | `P2` 中优先级 | `P3` 低优先级
- `fe` 前端 | `be` 后端 | `hw` 硬件 | `ml` AI | `infra` 基础设施
- `M1`-`M4` 对应交付里程碑

## M1：需求基线（截止 2026-03-01）

- [ ] **P0** `infra` 初始化 Monorepo 工程结构（pnpm workspace / turborepo）
- [ ] **P0** `infra` 配置 ESLint + Prettier + Husky + commitlint
- [x] **P0** `fe` 搭建 Vue3 + Vite + TypeScript + Three.js 前端项目 ✅
- [ ] **P0** `fe` 搭建 React Native / Expo 移动端项目
- [ ] **P0** `be` 搭建 NestJS 后端微服务项目
- [ ] **P0** `ml` 搭建 Python FastAPI ML 推理服务骨架
- [x] **P1** `infra` Docker Compose 本地开发环境（Redis + MySQL + InfluxDB） ✅
- [ ] **P1** `hw` 定义 Modbus-RTU 寄存器映射常量表

## M2：核心研发（截止 2026-03-25）

### 边缘网关（王涵哲）
- [ ] **P0** `hw` 实现 Modbus-RTU 主站轮询（100ms 周期，CRC-16 校验）
- [ ] **P0** `hw` 实现 WebSocket 二进制帧构建器（帧头 0xAA55 + HMAC 签名）
- [ ] **P1** `hw` 实现边缘数据清洗（中值滤波 + 3σ 异常剔除）
- [ ] **P1** `hw` 实现 24h 断点续传本地缓存（LevelDB/SQLite）
- [ ] **P1** `hw` 实现边缘自治 PID 控制器（断网 500ms 内切换）
- [ ] **P2** `hw` 实现 HMAC-SHA256 验签模块（Nonce 去重 + 时间窗口 2000ms）

### 实时枢纽（赵杰瑞）
- [x] **P0** `be` 实现 WebSocket 服务器（端口 3001） ✅
- [x] **P0** `be` 实现二进制帧解析器（0xAA55 + CRC-16） ✅
- [x] **P0** `be` 实现连接管理器（心跳 10s + JWT 认证） ✅
- [x] **P0** `be` 实现消息路由总线（0x01/0x02/0x03/0x04 分发） ✅
- [x] **P1** `be` 实现 Trace ID 注入与传播 ✅
- [ ] **P1** `be` 实现背压控制（入站限流）

### 遥测服务（赵杰瑞）
- [x] **P0** `be` 实现 Redis Pub/Sub 消费者（sensor_data 频道） ✅
- [x] **P0** `be` 实现 InfluxDB 批量写入（Line Protocol, batch 5000） ✅
- [x] **P1** `be` 实现 Redis 实时快照缓存（最新一条传感器读数） ✅
- [x] **P1** `be` 实现历史数据查询 API（GET /api/v1/assets/history） ✅
- [ ] **P2** `be` 实现 30 天数据过期策略 + 小时聚合任务

### AI 预测服务（赵杰瑞）
- [x] **P1** `ml` 实现 LSTM 模型训练管道（数据加载 + 特征工程） ✅ Mock LSTM, 训练脚本骨架就绪
- [x] **P1** `ml` 实现模型推理 API（FastAPI, < 70ms） ✅ Mock 推理, rtt < 5ms
- [x] **P2** `ml` 实现 FCR 饲料转化率优化算法 ✅ 代谢强度 + 投喂窗口
- [x] **P2** `ml` 实现多参数耦合异常检测（pH + NH3-N 复合风险） ✅ 规则引擎复合风险

### 规则引擎（赵杰瑞）
- [x] **P1** `be` 实现规则 DSL 解析器（阈值/趋势/耦合/预测规则） ✅
- [x] **P1** `be` 实现 DO 预警规则链（黄色预警 / 红色告警 / 预干预触发） ✅
- [x] **P2** `be` 实现风险等级评分（绿色/黄色/红色） ✅

### 控制服务（赵杰瑞）
- [x] **P0** `be` 实现 HMAC 指令签名生成 ✅
- [x] **P0** `be` 实现指令下发 API（POST /api/v1/control/command） ✅
- [x] **P1** `be` 实现指令生命周期追踪（pending -> ack -> executed） ✅
- [ ] **P1** `be` 实现手动优先仲裁逻辑
- [x] **P2** `be` 实现 Nonce 防重放缓存 ✅

### Web 3D 指挥中心（陈鹏翔）
- [x] **P0** `fe` 实现 Three.js 3D 场景初始化（Renderer + Camera + Lights） ✅
- [x] **P0** `fe` 实现养殖池 3D 模型渲染（半透明水体 Shader） ✅
- [x] **P0** `fe` 实现 WebSocket 客户端（双缓冲数据管道） ✅ ws 客户端 + Pinia 降级
- [x] **P1** `fe` 实现传感器节点 3D 标记与点击浮窗 ✅
- [ ] **P1** `fe` 实现设备状态动画（增氧机旋转 + 投喂器粒子）
- [ ] **P1** `fe` 实现 3D 热力云图（DO/温度空间分布）
- [x] **P1** `fe` 实现告警脉冲光效（橙色呼吸灯包围盒） ✅
- [x] **P1** `fe` 实现 AI 预测分析页面（三线对比 + 置信区间） ✅
- [x] **P2** `fe` 实现 CEO 综合管理看板（饼图/柱状图/成本收益曲线） ✅
- [ ] **P2** `fe` 实现多角色权限视图切换

### 移动端 App（陈鹏翔）
- [x] **P1** `fe` 实现红绿灯仪表盘首页（卡片式布局） ✅ TechnicianMobile.vue
- [x] **P1** `fe` 实现滑动解锁应急控制（防误触 + 硬件指令直达） ✅ 滑动解锁 + 应急按钮
- [ ] **P2** `fe` 实现强提醒通知推送（Critical Alert API）

### 基础设施
- [x] **P1** `infra` 编写 MySQL 初始化迁移脚本（设备/告警/用户/审计表） ✅
- [ ] **P1** `infra` 编写 K8s Deployment + Service + Ingress 配置
- [ ] **P2** `infra` 编写 Prometheus 监控规则 + Grafana Dashboard
- [ ] **P2** `infra` 编写 ELK 日志采集配置（Trace ID 追踪）

## M3：集成测试（截止 2026-04-05）

- [ ] **P0** `be` 网关 -> realtime-hub -> telemetry 全链路联调
- [ ] **P0** `fe` WebSocket -> 前端渲染 200ms 延迟验证
- [ ] **P0** `hw` 模拟断网 -> 边缘自治切换 -> 恢复续传 流程测试
- [ ] **P0** `be` HMAC 验签 + 重放攻击拦截测试
- [ ] **P1** `be` 50k msg/s 吞吐量压测
- [ ] **P1** `be` 10k 并发连接压力测试
- [ ] **P1** `ml` AI 预测精度 MAE < 0.5mg/L 验证

## M4：正式交付（截止 2026-04-14）

- [ ] **P0** 全链路 200ms P99 延迟专项压测报告
- [x] **P0** 交付全套基线文档（SRS + SDD + API Spec + 部署手册） ✅ README + PROJECT_BOARD 更新
- [ ] **P0** 交付源代码（含单元测试 + 集成测试）
- [ ] **P1** 甲方验收评审

---

## 当前开发阶段：Phase 1 完成 (2026-05-04)

11/17 Issues 已关闭。剩余未完成：
- 硬件/边缘相关 (5/6/7)：课程无需真实硬件，模拟器已替代
- K8s 部署 (10)：Docker Compose 本地开发已满足
- 全链路压测 (11)：课程演示环境无需 50k msg/s 压测
- 可观测性 + 权限视图等增强功能：可后续迭代

Phase 2 待团队成员自行分配。

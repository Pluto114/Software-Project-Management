# AquaIntelligence

高价值水产全生命周期数字孪生平台。通过 3D 数字孪生、时序 AI 预测模型及超低时延通信技术，将水产养殖从传统的「被动响应」升级为「主动决策」。

## 系统架构

采用「云-边-端」三位一体架构，围绕「感知 → 决策 → 执行」闭环展开。

| 层级 | 说明 | 核心指标 |
|------|------|----------|
| 感知层（物理端） | 传感器 (DO/pH/Temp/ORP/NH3-N) 通过 Modbus-RTU 汇聚至工业网关 | 10Hz 采样, 4-8 路并发 |
| 边缘计算层 | 数据清洗、本地 PID 自治、断点续传、HMAC 指令验签 | 断网切换 ≤ 500ms |
| 云端中枢层 | WebSocket 引擎、LSTM 预测集群、规则引擎、时序存储 | 50k msg/s, 10k 并发 |
| 展现层（终端） | 3D 数字孪生看板 (Web) + 移动端应急 App | E2E 延迟 ≤ 200ms |

## 技术栈

| 模块 | 技术选型 |
|------|----------|
| 后端服务 | Spring Boot 3.x / NestJS + Netty (WebSocket) |
| 前端 3D | Vue3 + Three.js / WebGL |
| 移动端 | React Native |
| AI 引擎 | Python TensorFlow/PyTorch (LSTM) |
| 实时缓存 | Redis |
| 关系数据库 | MySQL 8.0 |
| 时序数据库 | InfluxDB |
| 容器编排 | Kubernetes (K8s) |
| 可观测性 | Prometheus + Grafana + ELK |
| 通信协议 | Modbus-RTU + WebSocket 私有二进制帧 |
| 安全 | TLS 1.3 + HMAC-SHA256 + OAuth 2.0 + JWT |

## 关键性能指标

- **E2E 延迟**：全链路 ≤ 200ms（采集 30ms + 网络 50ms + 计算 70ms + 渲染 50ms）
- **并发连接**：单集群 10,000 传感器节点
- **消息吞吐**：50,000 msg/s 峰值处理
- **可用性**：99.99% SLA，支持边缘自治
- **AI 预测精度**：DO 预测 MAE < 0.5mg/L（2 小时窗口）

## 目录结构

```text
├── apps/                              # 应用层（前端）
│   ├── command-center-web/            # Web 3D 指挥中心
│   │   ├── src/
│   │   │   ├── App.vue                #   主入口 - 暗色主题"深邃工业"风格
│   │   │   ├── views/
│   │   │   │   ├── DigitalTwinDashboard.vue  #   3D 数字孪生看板 (Three.js)
│   │   │   │   └── AIAnalysis.vue           #   AI 预测分析界面
│   │   │   ├── components/
│   │   │   │   └── ThreeScene.vue           #   Three.js 3D 场景核心
│   │   │   ├── stores/
│   │   │   │   └── sensorData.ts            #   传感器数据状态管理 (Pinia)
│   │   │   └── websocket/
│   │   │       └── client.ts                #   WebSocket 客户端 (双缓冲渲染)
│   │   └── package.json
│   └── technician-mobile/             # 移动端应急 App
│       ├── src/
│       │   └── screens/
│       │       ├── Dashboard.tsx             #   红绿灯仪表盘首页
│       │       └── EmergencyControl.tsx      #   滑动解锁应急控制
│       └── package.json
├── edge/                              # 边缘计算层
│   ├── gateway-core/                  # 边缘网关核心
│   │   └── src/
│   │       ├── main.ts                #   网关入口 - 100ms Modbus 轮询
│   │       ├── modbus/
│   │       │   └── master.ts          #   Modbus-RTU 主站 (寄存器映射)
│   │       ├── protocol/
│   │       │   └── frame-builder.ts   #   WebSocket 二进制帧构建器
│   │       ├── cache/
│   │       │   └── local-store.ts     #   24h 断点续传本地缓存
│   │       ├── security/
│   │       │   └── hmac-verifier.ts   #   HMAC-SHA256 指令验签
│   │       └── edge-autonomy/
│   │           └── pid-controller.ts  #   本地 PID 控制器 (边缘自治)
│   └── protocol-plugins/              # 协议插件 (可插拔架构)
│       └── src/
│           ├── index.ts               #   插件接口定义 (IProtocolPlugin)
│           └── modbus-rtu/
│               └── plugin.ts          #   Modbus-RTU 协议插件实现
├── infra/                             # 基础设施
│   ├── database/
│   │   └── migrations/
│   │       ├── 001_init_schema.sql    #   初始化表结构 (设备/告警/用户/审计)
│   │       └── 002_timeseries_tables.sql  #   时序数据与聚合表
│   ├── k8s/
│   │   └── base/
│   │       ├── deployment.yaml        #   K8s 部署配置 (HPA 自动扩缩)
│   │       └── service.yaml           #   Service 与 Ingress 定义
│   └── observability/
│       ├── prometheus/
│       │   └── prometheus.yml         #   指标采集 (E2E 延迟/连接数/吞吐)
│       └── elk/
│           └── filebeat.yml           #   全链路 Trace ID 日志追踪
├── ml/                                # 机器学习
│   └── do-forecast-service/           # 溶解氧预测服务
│       ├── requirements.txt
│       └── src/
│           ├── model/
│           │   ├── lstm_model.py      #   LSTM 模型定义 (Keras)
│           │   └── fcr_optimizer.py   #   FCR 饲料转化率优化算法
│           ├── train.py               #   模型训练脚本
│           └── serve.py               #   推理服务 (FastAPI)
├── packages/                          # 共享包
│   └── shared-contracts/
│       └── src/
│           ├── types/
│           │   ├── sensor.ts          #   传感器数据类型定义
│           │   └── command.ts         #   控制指令类型定义
│           └── proto/
│               └── frame.proto        #   二进制帧协议定义 (Protobuf)
├── services/                          # 微服务层（后端）
│   ├── realtime-hub/                  # 实时枢纽 - WebSocket 长连接管理
│   │   └── src/
│   │       ├── main.ts                #   服务入口
│   │       ├── gateway/
│   │       │   └── websocket.gateway.ts   #   WSS 连接管理 (JWT认证/心跳)
│   │       └── services/
│   │           └── message-router.ts      #   消息路由 (按 payload type 分发)
│   ├── telemetry-service/             # 遥测服务 - 时序数据采集与存储
│   │   └── src/
│   │       ├── main.ts                #   服务入口
│   │       ├── ingest/
│   │       │   └── data-ingest.ts     #   数据接入 + 中值滤波 + 3σ异常剔除
│   │       └── query/
│   │           └── timeseries-query.ts    #   时序查询 (InfluxDB + Redis)
│   ├── rule-engine-service/           # 规则引擎 - 告警与自动化策略
│   │   └── src/
│   │       ├── main.ts                #   服务入口
│   │       ├── engine/
│   │       │   └── rule-evaluator.ts  #   规则评估器 (阈值/趋势/耦合/预测)
│   │       └── rules/
│   │           └── do-warning.rule.ts #   溶解氧预警规则链
│   └── control-service/               # 控制服务 - 指令下发与安全验签
│       └── src/
│           ├── main.ts                #   服务入口
│           ├── controllers/
│           │   └── command.controller.ts  #   指令下发 API
│           └── services/
│               └── signer.service.ts      #   HMAC 签名服务
├── tests/                             # 测试
│   ├── integration/
│   │   └── gateway-cloud.test.ts      #   网关-云端集成测试
│   ├── e2e/
│   │   └── full-flow.test.ts          #   端到端全流程测试
│   └── performance/
│       └── latency.test.ts            #   200ms 延迟专项压测
├── tools/                             # 工具集
│   ├── data-simulator/
│   │   └── index.ts                   #   传感器数据模拟器 (开发用)
│   └── dev-scripts/
│       └── start-all.sh               #   开发环境一键启动
├── docs/                              # 文档
│   ├── architecture.md                # 系统架构设计
│   ├── api-spec.md                    # API 接口规范
│   └── protocol-spec.md               # 通信协议规范
├── docker-compose.dev.yml
├── Makefile
└── LICENSE
```

## 核心业务流

### 数据全生命周期（感知 → 决策 → 执行）
1. 传感器每 100ms 采集 → 边缘中值滤波 + 异常剔除
2. WebSocket 二进制帧上报云端 → Redis 实时快照 + InfluxDB 持久化
3. AI 引擎 2h 趋势预测 → 规则引擎风险评级
4. 正常：更新 3D 看板 / 预警：触发预干预控制 / 极端：边缘自治接管

### 延迟预算（200ms E2E）

| 阶段 | 预算 | 负责 |
|------|------|------|
| 边缘采集与预处理 | ≤ 30ms | 王涵哲 (Hardware) |
| 网络传输 (WebSocket) | ≤ 50ms | 赵杰瑞 (Backend) |
| 云端逻辑与 AI 推演 | ≤ 70ms | 赵杰瑞 (Backend) |
| 前端双缓冲渲染 | ≤ 50ms | 陈鹏翔 (Frontend) |

## 四个核心子系统

| 子系统 | 功能 | 关键模块 |
|--------|------|----------|
| 感知子系统 | 协议适配、数据清洗、心跳监测 | edge/ |
| 计算子系统 | LSTM 推演引擎、风险评级、规则库 | ml/ + rule-engine-service |
| 交互子系统 | 3D 数字孪生渲染、时序看板、消息推送 | apps/ |
| 控制子系统 | 反向控制网关、指令加密、边缘自治 | control-service + edge/ |

## 团队职责 (RACI)

| 成员 | 角色 | 核心职责 |
|------|------|----------|
| 翁晨昊 | PM / 架构师 | 需求定义、架构设计、200ms 延迟压测、安全验签 |
| 赵杰瑞 | Backend | AI 预测模型、WebSocket 引擎、控制链路验签 |
| 陈鹏翔 | Frontend | 3D 数字孪生引擎、Web 指挥中心、移动端 App |
| 王涵哲 | Hardware | 底层硬件协议适配、传感器选型、边缘自治逻辑 |

## 交付里程碑

| 节点 | 日期 | 内容 |
|------|------|------|
| M1 需求基线 | 2026-03-01 | SRS 评审通过，原型图封版 |
| M2 核心研发 | 2026-03-25 | WebSocket 引擎与 3D 静态建模完成 |
| M3 集成测试 | 2026-04-05 | 全链路贯通，200ms 延迟专项压测 |
| M4 正式交付 | 2026-04-14 | 结项验收，交付全套基线文档与源码 |

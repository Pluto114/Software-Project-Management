# AquaIntelligence

高价值水产全生命周期数字孪生平台。通过 3D 数字孪生、时序 AI 预测模型及超低时延通信技术，将水产养殖从传统的「被动响应」升级为「主动决策」。

> 软件项目管理课程项目 | 团队：翁晨昊(PM)、赵杰瑞(Backend)、陈鹏翔(Frontend)、王涵哲(Hardware)

## 开发状态 (Phase 2 完成 · 2026-05-07)

**前端 5 页面 + 后端 4 微服务 + AI 服务 + Docker 设施全部可运行。UI 全面升级，设计系统重写。**

| 层 | 交付物 | 技术 | 端口 |
|---|--------|------|------|
| 前端 | 3D 数字孪生 / AI 分析 / CEO 看板 / 移动端 / **运维监控** | Vue3 + Three.js + ECharts | 5173 |
| 后端 | WebSocket 枢纽 / 遥测 / 控制 / 规则引擎 | Node.js + TypeScript | 3001-3004 |
| AI | DO 预测服务 + FCR 优化 | Python FastAPI | 8000 |
| 设施 | Redis + MySQL + InfluxDB | Docker Compose | 3307/6379/8086 |
| 工具 | 传感器数据模拟器 | TypeScript | - |
| 管理 | GitHub Issues Kanban 看板 | 17 Issues, 13 labels | - |

### 快速启动（前端独立模式）

> 前端无需 Docker、无需后端即可运行。无后端时自动降级到 Pinia 模拟数据。

```bash
cd apps/command-center-web
npm install          # 仅首次
npm run dev          # → http://localhost:5173/
```

浏览器打开后直接可用，所有 5 个页面模拟数据自动填充。

### 本地构建 & 预览（模拟生产部署）

```bash
cd apps/command-center-web
npm run build        # 产出 dist/
npx vite preview     # → http://localhost:4173/
```

### 全栈启动（需 Docker + Python）

> 前置要求：Node.js 18+, Docker Desktop, Python 3.10+

```bash
# 0. 安装依赖 (仅首次，耗时约 2-3 分钟)
cd services/realtime-hub && npm install && cd ../..
cd services/telemetry-service && npm install && cd ../..
cd services/control-service && npm install && cd ../..
cd services/rule-engine-service && npm install && cd ../..
cd ml/do-forecast-service && pip install -r requirements.txt && cd ../..
cd tools/dev-scripts && npm install && cd ../..

# 1. 基础设施
docker compose -f docker-compose.dev.yml up -d

# 2. 前端
cd apps/command-center-web && npm run dev         # :5173

# 3. 后端微服务 (各开终端)
cd services/realtime-hub && npm run dev           # WebSocket :3001
cd services/telemetry-service && npm run dev      # 遥测 :3002
cd services/control-service && npm run dev        # 控制 :3003
cd services/rule-engine-service && npm run dev    # 规则 :3004

# 4. AI 服务 (可选)
cd ml/do-forecast-service && python src/serve.py  # :8000

# 5. 数据模拟 (填充数据流)
cd tools/dev-scripts && npx tsx sensor-simulator.ts
```

### GitHub Pages 线上部署

> 推送 main 分支自动触发 GitHub Actions 构建并发布到 gh-pages 分支。

**部署架构**：

```text
git push main → deploy.yml → npm ci → npm run build → gh-pages 分支 → GitHub Pages
```

**⚠️ 2026-05-09 变更**：Pluto114 将 Vite `base` 从 `/Software-Project-Management/` 改为 `'/'`。这意味着：
- 项目仓库部署 URL 将变为 `https://pluto114.github.io/`（仅当仓库更名为 `pluto114.github.io` 时生效）
- 或需配置自定义域名
- 若保持当前仓库名，需将 `base` 改回 `/Software-Project-Management/`，否则部署后 JS/CSS 资源 404

**当前状态**：

| 项目 | 状态 |
|------|------|
| deploy.yml | ✅ 已配置（push main + 手动 dispatch） |
| CI 构建 | ✅ 最近 5 次全部成功 |
| gh-pages 分支 | ✅ 自动更新 |
| GitHub Pages 开关 | ⚠️ 需管理员手动启用 |
| Vite base | `'/'`（2026-05-09 Pluto114 修改） |

**管理员启用 Pages**（需 Pluto114 操作）：

1. 确认 `vite.config.ts` 中 `base` 值匹配仓库名或自定义域名
2. 仓库 Settings → Pages → Source 选 **Deploy from a branch**
3. Branch 选 `gh-pages`，目录 `/ (root)` → Save
4. 若仓库为私有：需先改为 **Public**（免费），或升级至 GitHub Pro
5. 等待 1-2 分钟部署完成

## 系统架构

采用「云-边-端」三位一体架构，围绕「感知 → 决策 → 执行」闭环展开。

| 层级 | 说明 | 核心指标 |
|------|------|----------|
| 感知层（物理端） | 传感器 (DO/pH/Temp/ORP/NH3-N) 通过 Modbus-RTU 汇聚至工业网关 | 10Hz 采样, 4-8 路并发 |
| 边缘计算层 | 数据清洗、本地 PID 自治、断点续传、HMAC 指令验签 | 断网切换 ≤ 500ms |
| 云端中枢层 | WebSocket 引擎、LSTM 预测集群、规则引擎、时序存储 | 50k msg/s, 10k 并发 |
| 展现层（终端） | 3D 数字孪生看板 (Web) + 移动端应急 App | E2E 延迟 ≤ 200ms |

## 技术栈

| 模块 | 技术选型 | 状态 |
|------|----------|------|
| 后端服务 | Node.js + TypeScript + Express | ✅ 4 个微服务 |
| 前端 3D | Vue3 + Three.js + ECharts | ✅ 5 个页面 |
| 移动端 | Vue3 响应式 (模拟手机) | ✅ /mobile 路由 |
| AI 引擎 | Python FastAPI + NumPy (演示) | ✅ port 8000 |
| 实时缓存 | Redis 7 | ✅ Docker |
| 关系数据库 | MySQL 8.0 | ✅ Docker |
| 时序数据库 | InfluxDB 2.7 | ✅ Docker |
| 容器编排 | Kubernetes (K8s) | ⏳ 待定 |
| 可观测性 | Prometheus + Grafana + ELK | ⏳ 待定 |
| 通信协议 | WebSocket 私有二进制帧 (0xAA55) | ✅ 已实现 |
| 安全 | HMAC-SHA256 + JWT | ✅ 已实现 |

## 关键性能指标

- **E2E 延迟**：全链路 ≤ 200ms（采集 30ms + 网络 50ms + 计算 70ms + 渲染 50ms）
- **并发连接**：单集群 10,000 传感器节点
- **消息吞吐**：50,000 msg/s 峰值处理
- **可用性**：99.99% SLA，支持边缘自治
- **AI 预测精度**：DO 预测 MAE < 0.5mg/L（2 小时窗口）

## 目录结构

```text
├── apps/
│   ├── command-center-web/src/
│   │   ├── App.vue                     #   Shell: 顶栏 + 底栏 + 路由
│   │   ├── views/
│   │   │   ├── DigitalTwinDashboard.vue #   3D 数字孪生看板 (Three.js)
│   │   │   ├── AIAnalysis.vue          #   AI 预测分析页 (ECharts)
│   │   │   ├── CEODashboard.vue         #   CEO 管理看板 (KPI+图表)
│   │   │   ├── ObservabilityDashboard.vue # 系统运维与可观测性看板
│   │   │   └── TechnicianMobile.vue     #   移动端红绿灯+滑动解锁
│   │   ├── components/
│   │   │   └── ThreeScene.vue          #   3D 场景 (水体/传感器/光照)
│   │   ├── composables/
│   │   │   └── useWebSocket.ts         #   WS 客户端 (自动降级 Pinia)
│   │   └── stores/
│   │       └── sensorData.ts           #   数据状态 (ws|sim 双模)
│   └── technician-mobile/              # (骨架，实际页面在 command-center-web)
├── services/
│   ├── realtime-hub/src/               #   WebSocket 枢纽 :3001
│   │   ├── gateway/websocket.gateway.ts #   JWT+心跳+二进制帧
│   │   └── services/message-router.ts   #   Redis Pub/Sub 分发
│   ├── telemetry-service/src/          #   遥测服务 :3002
│   │   ├── ingest/data-ingest.ts       #   中值滤波+3σ+InfluxDB
│   │   └── query/timeseries-query.ts   #   历史/实时查询 API
│   ├── control-service/src/            #   控制服务 :3003
│   │   ├── controllers/command.controller.ts  #  指令下发 API
│   │   └── services/signer.service.ts  #   HMAC-SHA256 签名
│   └── rule-engine-service/src/        #   规则引擎 :3004
│       ├── engine/rule-evaluator.ts    #   规则评估管线
│       └── rules/do-warning.rule.ts    #   DO 预警规则链
├── ml/do-forecast-service/src/         #   AI 服务 :8000
│   ├── model/lstm_model.py             #   LSTM 预测 (物理+噪声模拟)
│   ├── model/fcr_optimizer.py          #   FCR 投喂窗口优化
│   ├── serve.py                        #   FastAPI 推理 API
│   └── train.py                        #   训练脚本骨架
├── infra/
│   └── database/init.sql              #   MySQL 建表+种子数据
├── tools/dev-scripts/
│   ├── sensor-simulator.ts            #   边缘网关模拟器 (WS 推送)
│   └── create-issues.sh              #   GitHub Issues 批量创建
├── docker-compose.dev.yml             #   Redis+MySQL+InfluxDB 一键启动
└── PROJECT_BOARD.md                   #   任务看板 (17 Issues)
```

## 核心业务流

### 数据全生命周期（感知 → 决策 → 执行）

1. 传感器模拟器每 1s 生成仿真数据 → WebSocket 二进制帧上报 (0xAA55)
2. realtime-hub (3001) 解析帧 → CRC-16 校验 → Redis Pub/Sub 广播
3. telemetry-service (3002) 拉取 → 中值滤波 + 3σ 清洗 → Redis 快照 + InfluxDB 持久化
4. rule-engine-service (3004) 监听 → 阈值/趋势/复合风险评级 → 告警发布
5. AI 引擎 (8000) 2h DO 趋势预测 + FCR 投喂窗口优化
6. 前端同时消费 WebSocket 实时流 + REST API (预测/历史/控制)，断连自动降级 Pinia 模拟

### 演示数据链路

```
sensor-simulator  →  WebSocket (0xAA55 binary frames)
                  →  realtime-hub :3001  →  Redis Pub/Sub
                                         →  telemetry-service :3002  →  InfluxDB
                                         →  rule-engine-service :3004
                  →  前端 :5173 (WebSocket + REST API)
```

### 设计延迟预算（200ms E2E，课程设计目标）

| 阶段 | 预算 | 负责 |
|------|------|------|
| 边缘采集与预处理 (模拟) | ≤ 30ms | 王涵哲 (Hardware) |
| 网络传输 (WebSocket) | ≤ 50ms | 赵杰瑞 (Backend) |
| 云端逻辑与 AI 推演 | ≤ 70ms | 赵杰瑞 (Backend) |
| 前端双缓冲渲染 | ≤ 50ms | 陈鹏翔 (Frontend) |

## 四个核心子系统

| 子系统 | 功能 | 状态 |
|--------|------|------|
| 感知子系统 | 协议适配、数据清洗、心跳监测 | ✅ 模拟器替代 |
| 计算子系统 | DO 预测引擎、风险评级、规则库 | ✅ Mock LSTM + FCR 优化 |
| 交互子系统 | 3D 数字孪生渲染、时序看板、移动端 | ✅ 5 页面可运行 |
| 控制子系统 | 反向控制网关、HMAC 指令签名 | ✅ API 完整 |

## 团队职责 (RACI)

| 成员 | 角色 | 核心职责 |
|------|------|----------|
| 翁晨昊 | PM / 架构师 | 需求定义、架构设计、Issue 管理、安全验签 |
| 赵杰瑞 | Backend | WebSocket 引擎、遥测/控制/规则微服务、AI 预测模型 |
| 陈鹏翔 | Frontend | 3D 数字孪生引擎、Web 指挥中心、移动端 App |
| 王涵哲 | Hardware | 底层硬件协议设计、传感器选型文档、边缘自治逻辑 |

## 交付里程碑

| 节点 | 日期 | 内容 | 状态 |
|------|------|------|------|
| M1 需求基线 | 2026-03-01 | SRS 评审通过，原型图封版 | ✅ |
| M2 核心研发 | 2026-03-25 | WebSocket 引擎与 3D 静态建模完成 | ✅ |
| M3 集成测试 | 2026-04-05 | 全链路贯通，核心链路可演示 | ✅ Phase 1 |
| M4 正式交付 | 2026-04-14 | 结项验收，交付全套基线文档与源码 | ⏳ 待后续 |
| M5 Phase 2 | 2026-05-07 | 运维看板 + UI 设计系统重写 + 8 项缺陷修复 | ✅ Phase 2 |
| M6 Phase 2.5 | 2026-05-09 | 3D 鱼缸光照修复 + Vite base URL 变更 + Vite proxy 端口修正 + README 部署文档完善 | ✅ Phase 2.5 |

> **Phase 1 完成于 2026-05-04**：前端 4 页面 + 后端 4 微服务 + AI 服务 + Docker 设施 + 数据模拟器全部可运行。11/17 GitHub Issues 已关闭。
>
> **Phase 2 完成于 2026-05-07**：新增运维可观测性看板（E2E延迟图 + 网关拓扑 + 服务器资源 + 日志流）、全局 Design System 重写（深邃工业暗色主题，`#0a0e17` 底色）、CEO 看板修正（图表布局不重叠 + CSV UTF-8 BOM 中文不乱码）、AI Analysis 渐变色修正（明确色值映射替代正则替换）、移动端传感器字段匹配修复（`s.name` → `s.key`）、ThreeScene gsap 依赖移除（手动 `requestAnimationFrame` 缓动）。共 +1 新页面、8 项缺陷修复、1 次设计系统重构。已推送到 GitHub main 分支。
>
> **Phase 2.5 完成于 2026-05-09**：3D 鱼缸外部颜色 & 光照修正（新增 HemisphereLight 四壁均匀照亮 + 环境光提亮 + 池壁/池底金属度降低）、Vite base URL 由 Pluto114 改为 `'/'`（dev/preview 访问路径相应简化）、Vite proxy 端口修正（`/api` → 3002，`/ws` → 3001）、README 部署文档完善（前端独立快速启动 + 全栈启动分离 + GitHub Pages 部署步骤 + base URL 变更说明）。

## 页面路由一览

| 路径 | 页面 | 功能 | 角色 |
|------|------|------|------|
| `/` | 3D 数字孪生指挥舱 | Three.js 3D 鱼缸 + 传感器可视化 + 热力图 | admin, operator |
| `/ai-analysis` | AI 分析看板 | 时序预测图 + 风险因子 + 设备状态 | admin, viewer |
| `/ceo` | CEO 管理看板 | KPI 卡片 + 成本趋势 + 资产表格 + CSV 导出 | admin, viewer |
| `/mobile` | 移动端应急 | 红绿灯面板 + 滑动解锁控制 | admin, operator |
| `/observability` | 运维可观测性 | E2E 延迟图 + 网关拓扑 + 服务器资源 + 日志流 | 全部角色 |

# Software Project Management

工业物联网指挥调度平台，采用 Monorepo 架构，涵盖边缘计算、微服务、移动端和 Web 端。

## 目录结构

```text
├── apps/                         # 应用层（前端）
│   ├── command-center-web/       # Web 指挥中心 - 运维人员使用的后台管理 Dashboard
│   └── technician-mobile/        # 移动端 App - 现场技术人员使用的移动应用
├── edge/                         # 边缘计算层
│   ├── gateway-core/             # 边缘网关核心 - 设备接入、本地路由、离线自治
│   └── protocol-plugins/         # 协议插件 - 各类工业协议适配（Modbus、MQTT、OPC UA 等）
├── infra/                        # 基础设施
│   ├── database/                 # 数据库相关 - 表结构定义、迁移脚本、初始化数据
│   ├── k8s/                      # Kubernetes 部署 - Helm Charts、Kustomize 配置
│   └── observability/            # 可观测性 - 日志采集、指标监控、链路追踪配置
├── ml/                           # 机器学习
│   └── do-forecast-service/      # 调度预测服务 - 运筹优化与需求预测模型
├── packages/                     # 共享包
│   └── shared-contracts/         # 共享契约 - 跨服务的 API 定义、Proto 文件、通用类型
├── services/                     # 微服务层（后端）
│   ├── control-service/          # 控制服务 - 设备远程控制、指令下发与执行
│   ├── realtime-hub/             # 实时枢纽 - WebSocket/MQTT 长连接管理与实时数据推送
│   ├── rule-engine-service/      # 规则引擎 - 告警规则、自动化策略编排与触发
│   └── telemetry-service/        # 遥测服务 - 设备时序数据采集、存储与聚合查询
├── tests/                        # 测试 - 端到端测试、集成测试、性能测试
├── tools/                        # 工具集 - 开发脚本、CLI 工具、数据模拟器
├── docs/                         # 文档 - 架构设计、API 文档、运维手册
├── docker-compose.dev.yml        # 本地开发环境编排
├── Makefile                      # 统一构建入口
└── LICENSE
```

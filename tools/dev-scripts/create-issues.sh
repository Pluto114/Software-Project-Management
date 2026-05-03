#!/bin/bash
# GitHub Issues 批量创建脚本
# 用法: 先将 gh CLI 认证: gh auth login
#      然后运行: bash tools/dev-scripts/create-issues.sh
#
# 或手动认证后运行:
#   gh auth login --hostname github.com --web
#   bash tools/dev-scripts/create-issues.sh

REPO="Pluto114/Software-Project-Management"
GH="C:/Program Files/GitHub CLI/gh.exe"

# 检查认证
$GH auth status &>/dev/null
if [ $? -ne 0 ]; then
  echo "请先认证 GitHub CLI:"
  echo "  $GH auth login --hostname github.com"
  echo "  或在浏览器中访问: https://github.com/settings/tokens"
  echo "  生成 Token 后运行: $GH auth login --with-token"
  exit 1
fi

echo "开始创建 Issues..."

# M1
$GH issue create --repo "$REPO" --title "[M1] 初始化 Monorepo 工程结构" --body "配置 pnpm workspace / turborepo，管理 apps/ services/ edge/ ml/ packages/ 各子项目。
验收：各子项目能独立 build。" --label "P0,infra,M1"

# M2 - 边缘网关
$GH issue create --repo "$REPO" --title "[M2] 实现 Modbus-RTU 主站轮询（100ms 周期，CRC-16 校验）" --body "边缘网关核心功能：
- RS485 总线轮询传感器从站
- 寄存器映射：DO(0x0001)、Temp(0x0002)、pH(0x0003)、电流(0x0004)
- CRC-16 校验，连续3次失败标记传感器为不可信

负责人：王涵哲" --label "P0,hw,M2"

$GH issue create --repo "$REPO" --title "[M2] 实现边缘数据清洗与断点续传" --body "边缘网关功能：
- 中值滤波 + 标准差波动检测
- 24h 断点续传本地缓存
- 背压机制自动补录

负责人：王涵哲" --label "P1,hw,M2"

$GH issue create --repo "$REPO" --title "[M2] 实现边缘自治 PID 控制器" --body "边缘自治核心：
- 增量式 PID 算法（DO vs 安全阈值 4.5mg/L）
- 网络中断 500ms 内切换自治模式
- 网络恢复后回归云端控制

负责人：王涵哲" --label "P1,hw,M2"

# M2 - 后端
$GH issue create --repo "$REPO" --title "[M2] 实现 WebSocket 服务器与二进制帧解析" --body "实时枢纽核心：
- WebSocket 服务器 + 二进制帧解析
- 连接管理（心跳 + JWT 认证）
- 消息路由总线（0x01/0x02/0x03/0x04）

负责人：赵杰瑞
验收：100 并发连接稳定通信" --label "P0,be,M2"

$GH issue create --repo "$REPO" --title "[M2] 实现遥测服务（数据接入 + InfluxDB 存储）" --body "遥测服务：
- Redis Pub/Sub 消费者
- 中值滤波 + 异常值剔除
- InfluxDB 批量写入
- 历史查询 API

负责人：赵杰瑞" --label "P0,be,M2"

$GH issue create --repo "$REPO" --title "[M2] 实现 HMAC 指令签名与验签" --body "安全功能：
云端（赵杰瑞）：HMAC-SHA256 签名生成
边缘（王涵哲）：HMAC-SHA256 验签 + 防重放

验收：正确签名通过，重放攻击 100% 拦截" --label "P0,be,hw,M2"

$GH issue create --repo "$REPO" --title "[M2] 实现 DO 预警规则链与风险评级" --body "规则引擎：
- 阈值/趋势/预测/复合风险规则
- 黄/红 风险评级
- 动作执行器

负责人：赵杰瑞" --label "P1,be,M2"

# M2 - AI
$GH issue create --repo "$REPO" --title "[M2] 实现 LSTM 溶解氧预测模型" --body "AI 服务：
- 数据加载 + 特征工程
- LSTM 模型训练（早停 + 学习率衰减）
- FastAPI 推理 API（< 70ms）
- FCR 饲料转化率优化

负责人：赵杰瑞
验收：2h 窗口 MAE < 0.5mg/L" --label "P1,ml,M2"

# M2 - 前端
$GH issue create --repo "$REPO" --title "[M2] 实现 Web 3D 数字孪生指挥舱" --body "前端核心页面：
- Three.js 3D 养殖池渲染
- 传感器 3D 标记 + 点击浮窗
- 设备状态动画
- 3D 热力云图
- 告警脉冲光效
- 双缓冲渲染

负责人：陈鹏翔
验收：60fps，渲染延迟 <= 50ms" --label "P0,fe,M2"

$GH issue create --repo "$REPO" --title "[M2] 实现 AI 预测分析页面" --body "前端页面：
- 时序对比视图（实测+预测+历史同期）
- 置信区间阴影带
- 根因分析面板
- 风险因子雷达图

负责人：陈鹏翔" --label "P1,fe,M2"

$GH issue create --repo "$REPO" --title "[M2] 实现 CEO 综合管理看板" --body "前端页面：
- KPI 指标卡片
- 成本-收益趋势图
- 能耗分布饼图
- 资产总览表格

负责人：陈鹏翔" --label "P1,fe,M2"

$GH issue create --repo "$REPO" --title "[M2] 实现移动端红绿灯仪表盘 + 应急控制" --body "移动端 App：
- 卡片式养殖池概况
- 红绿灯状态指示
- 滑动解锁应急控制（防误触）
- 强提醒通知

负责人：陈鹏翔" --label "P1,fe,M2"

# M2 - 基础设施
$GH issue create --repo "$REPO" --title "[M2] Docker Compose 本地开发环境" --body "基础设施：
- Redis + MySQL + InfluxDB 容器化
- 各服务容器编排
- 一键启动全栈开发环境

验收：docker compose up 成功启动全部服务" --label "P1,infra,M2"

$GH issue create --repo "$REPO" --title "[M2] K8s 部署 + Prometheus 监控 + ELK 日志" --body "基础设施：
- Deployment + Service + Ingress 配置
- HPA 自动扩缩
- Prometheus 指标采集
- Grafana Dashboard
- ELK 全链路追踪

验收：kubectl apply 一键部署" --label "P2,infra,M2"

# M3
$GH issue create --repo "$REPO" --title "[M3] 全链路 200ms 延迟专项压测" --body "集成测试：
- 100 并发 P99 <= 200ms
- 延迟预算分解验证
- 50k msg/s 吞吐测试
- 10k 并发连接测试
- 边缘自治切换测试
- HMAC 安全测试

负责人：翁晨昊（A）、全员（R）" --label "P0,M3"

# M4
$GH issue create --repo "$REPO" --title "[M4] 交付全套基线文档与源码" --body "最终交付：
- SRS + SDD + API Spec + 部署手册
- 源代码 + 测试
- 甲方验收评审

截止日期：2026-04-14" --label "P0,M4"

echo ""
echo "Issues 创建完成！"
echo "查看: https://github.com/Pluto114/Software-Project-Management/issues"

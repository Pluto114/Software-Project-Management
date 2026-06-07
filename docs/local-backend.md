# 本机后端部署说明

## 启动完整后端链路

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\start-local-backend.ps1
```

默认会启动：

| 模块 | 端口 | 说明 |
|---|---:|---|
| Redis / MySQL / InfluxDB | 6379 / 3307 / 8086 | Docker Compose 基础设施 |
| realtime-hub | 3001 | WebSocket 枢纽，接收模拟器数据并广播给前端 |
| telemetry-service | 3002 | 遥测接入、实时快照、历史查询 |
| control-service | 3003 | HMAC 指令签名、紧急仲裁、控制事件发布 |
| rule-engine-service | 3004 | DO 阈值、趋势、复合风险规则 |
| asset-service | 3005 | 养殖池 CRUD、鱼批次投放、运营汇总 |
| do-forecast-service | 8000 | DO 预测与 FCR 投喂窗口 |
| sensor-simulator | - | 模拟边缘网关上报传感器数据 |

日志位置：`.local\logs`

如果本机没有安装 Docker 或 Docker 不在 PATH，脚本会自动跳过 Redis/MySQL/InfluxDB，并让 API 使用本地模拟兜底数据。完整时序链路需要安装 Docker Desktop 后重新运行脚本。

## 常用参数

```powershell
# 不安装依赖，只启动
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\start-local-backend.ps1 -SkipInstall

# 不启动 Docker，适合基础设施已经在运行时使用
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\start-local-backend.ps1 -SkipDocker

# 不启动 AI 服务
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\start-local-backend.ps1 -SkipAI

# 指定 Python 解释器
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\start-local-backend.ps1 -PythonExe "C:\Path\To\python.exe"

# 不启动传感器模拟器
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\start-local-backend.ps1 -NoSimulator

# 连前端一起启动
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\start-local-backend.ps1 -WithFrontend
```

## 停止

```powershell
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\stop-local-backend.ps1
```

连 Docker 基础设施一起停止：

```powershell
powershell -ExecutionPolicy Bypass -File tools\dev-scripts\stop-local-backend.ps1 -StopDocker
```

## 验证接口

```powershell
Invoke-RestMethod http://localhost:3001
Invoke-RestMethod http://localhost:3002/health
Invoke-RestMethod http://localhost:3003/health
Invoke-RestMethod http://localhost:3004/health
Invoke-RestMethod http://localhost:3005/health
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod "http://localhost:3002/api/v1/assets/realtime?pool_id=P01"
Invoke-RestMethod "http://localhost:3005/api/v1/management/pools"
Invoke-RestMethod -Method Post "http://localhost:3005/api/v1/management/pools" -ContentType "application/json" -Body '{"pool_code":"P09","base_name":"C基地","breed":"待投放","area_sqm":520,"water_depth_m":1.6,"manager":"管理员"}'
Invoke-RestMethod -Method Post "http://localhost:3005/api/v1/management/pools/P09/stock" -ContentType "application/json" -Body '{"breed":"石斑鱼","quantity":1200,"avg_weight_kg":0.02,"source":"本地苗场"}'
Invoke-RestMethod -Method Post "http://localhost:3004/api/v1/rules/evaluate" -ContentType "application/json" -Body '{"pool_id":"P01","sensor_type":"DO","value":4.3}'
Invoke-RestMethod "http://localhost:3004/api/v1/alerts"
Invoke-RestMethod -Method Post "http://localhost:3003/api/v1/control/command" -ContentType "application/json" -Body '{"device_id":"AERATOR-01","command":"aerator_freq","params":{"speed":75}}'
```

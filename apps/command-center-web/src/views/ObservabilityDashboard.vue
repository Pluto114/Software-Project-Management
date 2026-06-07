<template>
  <div class="obs-layout">
    <!-- Row 1: 指标卡片 -->
    <div class="metric-row">
      <div class="metric-card">
        <div class="metric-label">每秒平均响应延迟</div>
        <div class="metric-value orange">{{ avgLatency }} <span class="metric-unit">ms</span></div>
        <div class="metric-sub">近5分钟均值</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">P99 延迟</div>
        <div class="metric-value orange">{{ p99Latency }} <span class="metric-unit">ms</span></div>
        <div class="metric-sub" :class="p99Latency > 200 ? 'danger' : ''">
          {{ p99Latency > 200 ? '⚠ 超阈值' : '正常范围' }}
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">在线服务</div>
        <div class="metric-value green">{{ onlineServices }}/{{ totalServices }}</div>
        <div class="metric-sub">{{ totalServices - onlineServices }} 个离线</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">WebSocket 连接数</div>
        <div class="metric-value cyan">{{ wsConnections.toLocaleString() }}</div>
        <div class="metric-sub">活跃连接</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">目标故障时长</div>
        <div class="metric-value red">{{ mttr }} <span class="metric-unit">分钟</span></div>
        <div class="metric-sub">MTTR 本月</div>
      </div>
    </div>

    <!-- Row 2: 延迟波动图 + 网关拓扑 -->
    <div class="chart-row">
      <div class="panel chart-panel">
        <div class="panel-header">
          <span class="panel-title">实时端到端延迟波动</span>
          <div class="panel-actions">
            <span class="live-dot">●</span> LIVE
          </div>
        </div>
        <div ref="latencyChartRef" class="chart-main"></div>
      </div>
      <div class="panel topo-panel">
        <div class="panel-header">
          <span class="panel-title">分布式网关在线拓扑</span>
          <span class="panel-sub">{{ onlineGateways }}/{{ totalGateways }} 在线</span>
        </div>
        <div ref="topoChartRef" class="chart-main"></div>
      </div>
    </div>

    <!-- Row 3: 服务器资源 + 日志流 -->
    <div class="bottom-row">
      <div class="panel resource-panel">
        <div class="panel-header">
          <span class="panel-title">服务器集群资源占用</span>
        </div>
        <div class="resource-grid">
          <div class="resource-item" v-for="r in resources" :key="r.name">
            <div class="resource-header">
              <span class="resource-name">{{ r.name }}</span>
              <span class="resource-pct" :class="r.pct > 80 ? 'danger' : r.pct > 60 ? 'warn' : ''">{{ r.pct }}%</span>
            </div>
            <div class="resource-bar">
              <div class="resource-fill" :style="{ width: r.pct + '%', background: r.pct > 80 ? 'var(--accent-red)' : r.pct > 60 ? 'var(--accent-orange)' : 'var(--accent-blue)' }"></div>
            </div>
            <div class="resource-detail">{{ r.detail }}</div>
          </div>
        </div>
      </div>
      <div class="panel log-panel">
        <div class="panel-header">
          <span class="panel-title">日志 / 告警流</span>
          <span class="log-count">{{ logEntries.length }} 条</span>
        </div>
        <div class="log-stream" ref="logStreamRef">
          <div class="log-entry" v-for="(entry, i) in logEntries" :key="i" :class="'level-' + entry.level">
            <span class="log-time">{{ entry.time }}</span>
            <span class="log-level-tag" :class="entry.level">{{ entry.levelTag }}</span>
            <span class="log-msg">{{ entry.msg }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useSensorStore } from '../stores/sensorData'

const latencyChartRef = ref<HTMLDivElement>()
const topoChartRef = ref<HTMLDivElement>()
const logStreamRef = ref<HTMLDivElement>()

const store = useSensorStore()

let charts: echarts.ECharts[] = []
let logTimer: number | null = null
let dataTimer: number | null = null

// ---- 指标数据 ----
const avgLatency = ref(84)
const p99Latency = ref(162)
const onlineServices = ref(11)
const totalServices = ref(12)
const wsConnections = ref(3286)
const mttr = ref(4.2)
const onlineGateways = ref(7)
const totalGateways = ref(9)

const latencyData: number[] = []
const latencyTimes: string[] = []

// ---- 服务器资源 ----
const resources = ref([
  { name: 'API Server #01', pct: 42, detail: 'CPU 42% · 内存 3.2/8 GB' },
  { name: 'API Server #02', pct: 38, detail: 'CPU 38% · 内存 2.8/8 GB' },
  { name: '预测服务节点', pct: 68, detail: 'GPU 68% · 显存 6.8/12 GB' },
  { name: '时序数据库', pct: 55, detail: 'CPU 55% · 磁盘 320/500 GB' },
  { name: 'WebSocket 网关', pct: 23, detail: 'CPU 23% · 连接 3,286' },
  { name: '备份节点', pct: 12, detail: 'CPU 12% · 磁盘 180/500 GB' },
])

// ---- 日志流 ----
interface LogEntry {
  time: string
  level: 'info' | 'warn' | 'error'
  levelTag: string
  msg: string
}

const logEntries = ref<LogEntry[]>([
  { time: '14:08:22', level: 'warn', levelTag: 'WARN', msg: '路径切换：网关心跳中断，备用网关 #03 已接管' },
  { time: '14:08:19', level: 'info', levelTag: 'INFO', msg: 'WebSocket 连接池：3,286 活跃连接' },
  { time: '14:08:15', level: 'info', levelTag: 'INFO', msg: '预测服务完成：溶氧预估 5.2mg/L，置信度 92%' },
  { time: '14:08:10', level: 'warn', levelTag: 'WARN', msg: 'API Server #02 内存使用率超过 70%' },
  { time: '14:08:05', level: 'info', levelTag: 'INFO', msg: '数据同步完成：时序库写入 1,240 条记录' },
  { time: '14:08:01', level: 'error', levelTag: 'ERROR', msg: '边缘节点 E03 数据上报超时（>200ms），进入本地缓存模式' },
  { time: '14:07:55', level: 'info', levelTag: 'INFO', msg: '健康检查通过：11/12 服务在线' },
  { time: '14:07:48', level: 'warn', levelTag: 'WARN', msg: 'P99 延迟峰值 186ms，接近 200ms 告警阈值' },
  { time: '14:07:40', level: 'info', levelTag: 'INFO', msg: '心跳检测：网关 #01-#07 正常，响应时间 12ms' },
  { time: '14:07:32', level: 'info', levelTag: 'INFO', msg: '3D 渲染帧率稳定：58fps' },
])

function addLogEntry() {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  const infoMsgs = [
    'WebSocket 心跳正常：全节点响应 ≤15ms',
    '时序库写入：1,180 条/批次',
    '3D 渲染帧率：60fps (Triple Buffer)',
    '数据校验通过：最近 1000 条无异常值',
    '气象 API 数据更新：气压 1013hPa',
  ]
  const warnMsgs = [
    '网关 #04 响应延迟 45ms，超慢速阈值',
    '内存使用率接近高水位线（78%）',
    '预测任务队列积压：等待中 3 条',
  ]
  const rand = Math.random()
  let level: 'info' | 'warn' | 'error', levelTag: string, msg: string
  if (rand < 0.08) {
    level = 'error'; levelTag = 'ERROR'
    msg = '边缘节点 E02 数据断连，触发本地自治模式'
  } else if (rand < 0.25) {
    level = 'warn'; levelTag = 'WARN'
    msg = warnMsgs[Math.floor(Math.random() * warnMsgs.length)]
  } else {
    level = 'info'; levelTag = 'INFO'
    msg = infoMsgs[Math.floor(Math.random() * infoMsgs.length)]
  }
  logEntries.value.unshift({ time, level, levelTag, msg })
  if (logEntries.value.length > 50) logEntries.value.pop()
  // Auto-scroll to top (newest entries)
  nextTick(() => {
    if (logStreamRef.value) {
      logStreamRef.value.scrollTop = 0
    }
  })
}

// ---- 图表初始化 ----
function initLatencyChart() {
  if (!latencyChartRef.value) return
  const chart = echarts.init(latencyChartRef.value)

  // 预填充数据
  for (let i = 80; i >= 0; i--) {
    latencyTimes.push(`${i}s`)
    latencyData.push(60 + Math.random() * 100)
  }

  chart.setOption({
    backgroundColor: 'transparent',
    grid: { left: 45, right: 30, top: 15, bottom: 25 },
    xAxis: {
      type: 'category', data: latencyTimes,
      axisLabel: { color: '#7b8794', fontSize: 9, interval: 15 },
      axisLine: { lineStyle: { color: '#c9d3dd' } },
    },
    yAxis: {
      type: 'value', name: 'ms',
      axisLabel: { color: '#7b8794', fontSize: 9 },
      splitLine: { lineStyle: { color: '#e5eaf0' } },
    },
    series: [{
      type: 'line', data: latencyData,
      lineStyle: { color: '#b86525', width: 2 },
      itemStyle: { color: '#b86525' },
      symbol: 'none', smooth: true,
      areaStyle: {
        color: 'rgba(184, 101, 37, 0.12)',
      },
      markLine: {
        silent: true, symbol: 'none',
        lineStyle: { color: '#bf3d35', type: 'dashed', width: 1.5 },
        label: { color: '#bf3d35', fontSize: 10, formatter: 'P99 阈值 200ms' },
        data: [{ yAxis: 200 }],
      },
    }],
    tooltip: { trigger: 'axis' },
  })
  charts.push(chart)
}

function initTopoChart() {
  if (!topoChartRef.value) return
  const chart = echarts.init(topoChartRef.value)

  const gwData = [
    { name: 'GW-01', x: 150, y: 80, status: 'online', load: 34 },
    { name: 'GW-02', x: 350, y: 80, status: 'online', load: 28 },
    { name: 'GW-03', x: 250, y: 160, status: 'online', load: 45 },
    { name: 'GW-04', x: 150, y: 240, status: 'offline', load: 0 },
    { name: 'GW-05', x: 350, y: 240, status: 'online', load: 22 },
    { name: 'GW-06', x: 100, y: 160, status: 'online', load: 31 },
    { name: 'GW-07', x: 400, y: 160, status: 'online', load: 19 },
    { name: 'GW-08', x: 250, y: 40, status: 'offline', load: 0 },
    { name: 'GW-09', x: 250, y: 280, status: 'online', load: 37 },
  ]

  const nodes = gwData.map(g => ({
    name: g.name,
    x: g.x, y: g.y,
    symbolSize: g.status === 'online' ? 24 : 18,
    itemStyle: {
      color: g.status === 'online'
        ? g.load > 40 ? '#b86525' : '#2f7d57'
        : '#9aa6b2',
      borderColor: g.status === 'online'
        ? g.load > 40 ? '#b86525' : '#2f7d57'
        : '#c8d2dc',
      borderWidth: 2,
    },
    label: { show: true, color: '#7b8794', fontSize: 9, position: 'bottom' },
  }))

  // 星型连接 (所有节点连接到中心)
  const centerNode = { name: 'Cloud', x: 250, y: 160, symbolSize: 32, itemStyle: { color: '#256f8f', borderColor: '#256f8f', borderWidth: 3 }, label: { show: true, color: '#256f8f', fontSize: 10, fontWeight: 'bold', position: 'bottom' } }
  nodes.push(centerNode)

  const links = gwData.map(g => ({
    source: 'Cloud', target: g.name,
    lineStyle: {
      color: g.status === 'online' ? '#c8d2dc' : '#edf2f7',
      type: g.status === 'online' ? 'solid' : 'dashed',
      width: g.status === 'online' ? 1.5 : 0.8,
    },
  }))

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        if (p.name === 'Cloud') return '<b>云端服务器</b><br/>全节点接入'
        const d = gwData.find(g => g.name === p.name)
        if (!d) return p.name
        return `<b>${d.name}</b><br/>状态: ${d.status === 'online' ? '在线' : '离线'}<br/>负载: ${d.load}%`
      },
    },
    series: [{
      type: 'graph',
      layout: 'none',
      roam: false,
      draggable: false,
      data: nodes,
      links,
      coordinateSystem: undefined as any,
      width: 500,
      height: 320,
      edgeSymbol: ['none', 'none'],
    }],
  })
  charts.push(chart)
}

// ---- 生命周期 ----
onMounted(() => {
  initLatencyChart()
  initTopoChart()

  // 每秒更新数据
  dataTimer = window.setInterval(() => {
    // E2E 延迟波动
    latencyTimes.push(`${latencyTimes.length}s`)
    latencyTimes.shift()
    latencyData.push(60 + Math.random() * 110)
    latencyData.shift()

    if (charts[0]) {
      charts[0].setOption({
        xAxis: { data: [...latencyTimes] },
        series: [{ data: [...latencyData] }],
      })
    }

    // 动态指标
    avgLatency.value = Math.floor(70 + Math.random() * 30)
    p99Latency.value = Math.floor(140 + Math.random() * 60)
    wsConnections.value = Math.floor(3100 + Math.random() * 400)
    mttr.value = +(3.5 + Math.random() * 1.5).toFixed(1)

    // 更新资源
    resources.value.forEach(r => {
      r.pct = Math.max(5, Math.min(95, r.pct + (Math.random() - 0.5) * 6))
      r.pct = Math.round(r.pct)
    })

    // 周期性更新拓扑图负载
    if (charts[1] && Math.random() < 0.3) {
      // 拓扑图负载动态刷新 — 简化做法：仅更新 tooltip 数据
    }
  }, 2000)

  // 日志流更新
  logTimer = window.setInterval(() => {
    addLogEntry()
  }, 4000)
})

onUnmounted(() => {
  charts.forEach(c => c.dispose())
  if (logTimer) clearInterval(logTimer)
  if (dataTimer) clearInterval(dataTimer)
})
</script>

<style scoped>
.obs-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 10px;
  overflow-y: auto;
}

/* 指标卡片行 */
.metric-row {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.metric-card {
  flex: 1;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px 16px;
  transition: border-color 0.2s;
}
.metric-card:hover { border-color: var(--border-active); }
.metric-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  letter-spacing: 0;
}
.metric-value {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
}
.metric-value.orange { color: var(--accent-orange); }
.metric-value.green { color: var(--accent-green); }
.metric-value.cyan { color: var(--accent-blue); }
.metric-value.red { color: var(--accent-red); }
.metric-unit { font-size: 14px; font-weight: 400; color: var(--text-secondary); }
.metric-sub { font-size: 10px; color: var(--text-dim); }
.metric-sub.danger { color: var(--accent-red); }

/* 图表行 */
.chart-row {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.chart-panel { flex: 1.5; }
.topo-panel { flex: 1; }
.chart-main { width: 100%; height: 320px; }

.panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--accent-green);
  letter-spacing: 0.1em;
}
.live-dot {
  font-size: 8px;
  animation: alert-blink 1.5s ease-in-out infinite;
}

.panel-sub { font-size: 10px; color: var(--text-dim); margin-left: 8px; }

/* 底部行 */
.bottom-row {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.resource-panel { flex: 1; }
.log-panel { flex: 1; }

/* 服务器资源 */
.resource-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.resource-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.resource-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.resource-name { font-size: 12px; color: var(--text-primary); }
.resource-pct {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-blue);
}
.resource-pct.warn { color: var(--accent-orange); }
.resource-pct.danger { color: var(--accent-red); }
.resource-bar {
  height: 4px;
  background: #edf2f7;
  border-radius: 2px;
  overflow: hidden;
}
.resource-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s, background 0.3s;
}
.resource-detail {
  font-size: 10px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

/* 日志流 */
.log-count { font-size: 10px; color: var(--text-dim); }
.log-stream {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 320px;
  overflow-y: auto;
}
.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 10px;
  font-family: var(--font-mono);
  animation: fade-in 0.2s ease;
}
.log-entry.level-error {
  background: var(--accent-red-dim);
  border-radius: 3px;
  padding-left: 6px;
}
.log-entry.level-warn {
  background: var(--accent-orange-dim);
  border-radius: 3px;
  padding-left: 6px;
}
.log-time { color: var(--text-dim); min-width: 48px; flex-shrink: 0; }
.log-level-tag {
  min-width: 36px;
  text-align: center;
  font-weight: 700;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 2px;
  flex-shrink: 0;
}
.log-level-tag.info { color: var(--accent-blue); background: var(--accent-blue-dim); }
.log-level-tag.warn { color: var(--accent-orange); background: var(--accent-orange-dim); }
.log-level-tag.error { color: var(--accent-red); background: var(--accent-red-dim); }
.log-msg { color: var(--text-secondary); flex: 1; word-break: break-all; }
</style>

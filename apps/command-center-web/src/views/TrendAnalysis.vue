<template>
  <div class="analysis-layout">
    <!-- 趋势图表区 -->
    <main class="analysis-main">
      <!-- 交互工具栏 -->
      <div class="toolbar">
        <div class="toolbar-group">
          <span class="toolbar-label">养殖池</span>
          <button
            v-for="p in visiblePools"
            :key="p.id"
            class="tb-btn"
            :class="{ active: activePool === p.id, [p.riskLevel]: activePool === p.id }"
            @click="switchPool(p.id)"
          >
            <span class="tb-dot" :class="p.riskLevel"></span>
            {{ p.id }} {{ p.name }}
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <div class="toolbar-group">
          <span class="toolbar-label">指标</span>
          <button
            v-for="m in metrics"
            :key="m.key"
            class="tb-btn"
            :class="{ active: activeMetric === m.key }"
            @click="activeMetric = m.key; rebuildMainChart()"
          >
            {{ m.label }}
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <div class="toolbar-group">
          <span class="toolbar-label">时间窗</span>
          <button
            v-for="r in timeRanges"
            :key="r.seconds"
            class="tb-btn"
            :class="{ active: timeRange === r.seconds }"
            @click="setTimeRange(r.seconds)"
          >
            {{ r.label }}
          </button>
        </div>

        <div class="toolbar-spacer"></div>
        <span class="scope-badge">{{ auth.user?.roleLabel }} · {{ auth.user?.scopeLabel }}</span>

        <button class="tb-btn predict-btn" @click="triggerPrediction" :disabled="predicting">
          {{ predicting ? '生成中...' : '生成趋势' }}
        </button>
      </div>

      <div class="panel chart-panel">
        <div class="panel-header">
          <span class="panel-title">
            {{ activePool === 'P01' ? '#01' : '#02' }} 池 {{ metricLabel }} 时序视图
          </span>
          <div class="chart-legend">
            <span class="legend-item"><span class="legend-dot actual"></span> 实测</span>
            <span class="legend-item"><span class="legend-dot predicted"></span> 趋势预估</span>
            <span class="legend-item"><span class="legend-dot ci"></span> 波动范围</span>
            <span class="legend-item"><span class="legend-dot history"></span> 历史同期</span>
          </div>
        </div>
        <div ref="mainChartRef" class="chart-container"></div>
      </div>

      <!-- 底部双栏 -->
      <div class="bottom-charts">
        <div class="panel half">
          <div class="panel-header">
            <span class="panel-title">水温趋势</span>
            <span class="panel-sub">{{ activePool }} 实时水温</span>
          </div>
          <div ref="tempChartRef" class="chart-sm"></div>
        </div>
        <div class="panel half">
          <div class="panel-header">
            <span class="panel-title">pH 变化</span>
            <span class="panel-sub">{{ activePool }} 实时 pH</span>
          </div>
          <div ref="phChartRef" class="chart-sm"></div>
        </div>
      </div>
    </main>

    <!-- 右侧分析面板 -->
    <aside class="analysis-sidebar">
      <!-- 根因分析 -->
      <div class="panel" :class="{ 'pulse-border-orange': rootCauseHighlight }">
        <div class="panel-header">
          <span class="panel-title">风险原因</span>
          <button class="tb-btn sm" @click="refreshRootCauses">刷新</button>
        </div>
        <div class="root-cause">
          <div
            class="cause-item"
            v-for="(cause, i) in currentCauses"
            :key="i"
            :class="{ primary: i === 0 && rootCauseHighlight }"
          >
            <span class="cause-icon" :class="{ sec: i > 0, pulse: i === 0 && rootCauseHighlight }">{{ i === 0 ? '!' : i + 1 }}</span>
            <div>
              <div class="cause-title">{{ cause.title }}</div>
              <div class="cause-desc">{{ cause.desc }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 雷达图 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">风险因子权重</span>
          <span class="panel-sub">{{ activePool }}</span>
        </div>
        <div ref="radarChartRef" class="chart-md"></div>
      </div>

      <!-- 历史事件时间轴 -->
      <div class="panel" style="flex: 1; overflow-y: auto;">
        <div class="panel-header">
          <span class="panel-title">事件时间轴</span>
          <button class="tb-btn sm" @click="clearAcknowledged">
            清除已确认
          </button>
        </div>
        <div class="event-timeline">
          <div
            class="event-item"
            v-for="e in filteredEvents"
            :key="e.id"
            :class="{ acknowledged: e.acknowledged, expanded: e.expanded, shake: e.isNew }"
            @click="toggleEvent(e)"
          >
            <div class="event-time">{{ e.time }}</div>
            <div class="event-dot" :class="e.type"></div>
            <div class="event-content">
              <div class="event-title">
                {{ e.title }}
                <span v-if="e.acknowledged" class="ack-badge">已确认</span>
              </div>
              <div class="event-desc">{{ e.desc }}</div>
              <div v-if="e.expanded" class="event-detail">
                <div class="event-meta">
                  <span>触发阈值: {{ e.threshold || '—' }}</span>
                  <span>当前值: {{ e.currentValue || '—' }}</span>
                </div>
                <div class="event-suggestion">{{ e.suggestion || '暂无处置建议' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useSensorStore } from '../stores/sensorData'
import { useAuthStore } from '../stores/auth'

const mainChartRef = ref<HTMLDivElement>()
const tempChartRef = ref<HTMLDivElement>()
const phChartRef = ref<HTMLDivElement>()
const radarChartRef = ref<HTMLDivElement>()

const store = useSensorStore()
const auth = useAuthStore()

let charts: echarts.ECharts[] = []
let updateTimer: number | null = null

// ---- 交互状态 ----
type PoolId = 'P01' | 'P02'
const pools: Array<{ id: PoolId; name: string; baseName: string; riskLevel: 'normal' | 'unstable' }> = [
  { id: 'P01', name: '南美白对虾', baseName: 'A基地', riskLevel: 'normal' },
  { id: 'P02', name: '南美白对虾', baseName: 'A基地', riskLevel: 'unstable' },
]
const visiblePools = computed(() => pools.filter(pool => auth.canSeeBase(pool.baseName)))
const firstVisiblePool = computed<PoolId>(() => visiblePools.value[0]?.id || 'P01')
const activePool = ref<PoolId>('P01')

const metrics = [
  { key: 'DO', label: '溶氧 DO', unit: 'mg/L', min: 2, max: 9 },
  { key: 'TEMP', label: '水温', unit: '°C', min: 20, max: 35 },
  { key: 'pH', label: 'pH', unit: 'pH', min: 6.5, max: 8.5 },
  { key: 'NH3N', label: '氨氮', unit: 'mg/L', min: 0.05, max: 0.5 },
]
const activeMetric = ref('DO')
const metricLabel = computed(() => metrics.find(m => m.key === activeMetric.value)?.label || 'DO')
const metricUnit = computed(() => metrics.find(m => m.key === activeMetric.value)?.unit || 'mg/L')
const metricRange = computed(() => metrics.find(m => m.key === activeMetric.value) || metrics[0])

const timeRanges = [
  { seconds: 30, label: '30s', maxPoints: 30 },
  { seconds: 120, label: '2min', maxPoints: 120 },
  { seconds: 300, label: '5min', maxPoints: 300 },
  { seconds: 3600, label: '1h', maxPoints: 3600 },
  { seconds: 21600, label: '6h', maxPoints: 3600 },
  { seconds: 86400, label: '24h', maxPoints: 3600 },
]
const timeRange = ref(120)
const maxPoints = computed(() => {
  const tr = timeRanges.find(r => r.seconds === timeRange.value)
  return tr ? tr.maxPoints : 120
})

const predicting = ref(false)

// ---- 数据缓冲 ----
const dataBuffers: Record<string, Record<string, number[]>> = {
  P01: { DO: [], TEMP: [], pH: [], NH3N: [] },
  P02: { DO: [], TEMP: [], pH: [], NH3N: [] },
}
const doPredicted: number[] = []
const ciUpper: number[] = []
const ciLower: number[] = []
const historySamePeriod: number[] = []
const timeLabels: string[] = []

function tickLabel(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
}

function rollingPush(arr: number[], val: number, max: number) {
  arr.push(val)
  while (arr.length > max) arr.shift()
}

// ---- 事件系统 ----
interface TimelineEvent {
  id: string
  time: string
  type: 'warning' | 'info' | 'action' | 'danger'
  poolId: string
  title: string
  desc: string
  acknowledged: boolean
  expanded: boolean
  isNew: boolean
  threshold?: string
  currentValue?: string
  suggestion?: string
}

const events = reactive<TimelineEvent[]>([
  { id: 'e1', time: '18:32', type: 'warning', poolId: 'P02', title: 'DO 下降趋势', desc: '未来2h溶氧可能降至4.3mg/L', acknowledged: false, expanded: false, isNew: false, threshold: 'DO < 4.5 mg/L', currentValue: '4.3 mg/L', suggestion: '建议提前30min开启增氧设备，提升频率至75%' },
  { id: 'e2', time: '17:45', type: 'warning', poolId: 'P02', title: 'pH 变化率异常', desc: '小时变化率 0.15，超过正常范围', acknowledged: false, expanded: false, isNew: false, threshold: 'ΔpH/h < 0.1', currentValue: '0.15', suggestion: '检查底层残饵堆积，考虑换水10%' },
  { id: 'e3', time: '16:10', type: 'info', poolId: 'P01', title: '增氧机维护完成', desc: '#02 增氧机例行维护，电流恢复正常', acknowledged: false, expanded: false, isNew: false },
  { id: 'e4', time: '14:20', type: 'danger', poolId: 'P01', title: '水温超阈值', desc: '水温达 28.2°C，超过 28°C 黄色预警线', acknowledged: false, expanded: false, isNew: false, threshold: 'TEMP < 28°C', currentValue: '28.2°C', suggestion: '开启循环水泵，增加水体交换' },
  { id: 'e5', time: '12:05', type: 'action', poolId: 'P01', title: '预防性增氧启动', desc: '规则联动：增氧机频率自动提升 15%', acknowledged: false, expanded: false, isNew: false },
  { id: 'e6', time: '10:30', type: 'info', poolId: 'P02', title: '气象数据更新', desc: '获取到高德气象API数据：夜间气压将下降', acknowledged: false, expanded: false, isNew: false },
  { id: 'e7', time: '08:15', type: 'action', poolId: 'P02', title: '投喂窗口建议', desc: '建议 08:30-09:00 投喂，代谢强度 0.72', acknowledged: false, expanded: false, isNew: false },
])

const filteredEvents = computed(() =>
  events.filter(e => e.poolId === activePool.value)
)

function toggleEvent(e: TimelineEvent) {
  e.expanded = !e.expanded
  if (!e.acknowledged) {
    e.acknowledged = true
    setTimeout(() => { e.isNew = false }, 500)
  }
}

function clearAcknowledged() {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].acknowledged && events[i].type !== 'warning' && events[i].type !== 'danger') {
      events.splice(i, 1)
    }
  }
}

// ---- 根因分析 ----
const rootCauseHighlight = ref(false)
let rootCauseTimer: number | null = null

function triggerRootCauseHighlight() {
  rootCauseHighlight.value = true
  if (rootCauseTimer) clearTimeout(rootCauseTimer)
  rootCauseTimer = window.setTimeout(() => {
    rootCauseHighlight.value = false
  }, 5000)
}

const rootCauseConfigs: Record<string, Array<{ title: string; desc: string }>> = {
  P01: [
    { title: '气压波动 3%', desc: '主要因子：傍晚气压下降影响夜间溶氧' },
    { title: '水温日较差 2.1°C', desc: '次要因子：昼夜温差影响摄食节律' },
    { title: '氨氮微幅上升', desc: '关联因子：底层残饵缓慢分解' },
  ],
  P02: [
    { title: '气压骤降 5%', desc: '主要原因：气压突变导致溶氧预测下滑' },
    { title: '氨氮累积上升', desc: '次要因素：底层残饵分解加速，逼近安全线' },
    { title: '水温日较差增大', desc: '关联因子：傍晚降温 3°C，加剧溶氧消耗' },
  ],
}
const currentCauses = computed(() => rootCauseConfigs[activePool.value])

function refreshRootCauses() {
  updateRadarChart()
}

// ---- 雷达图 ----
const radarData: Record<string, number[]> = {
  P01: [25, 30, 29, 18, 40],
  P02: [45, 38, 33, 25, 58],
}
const radarIndicators = [
  { name: '气压突变', max: 100 },
  { name: '氨氮累积', max: 100 },
  { name: '水温变化', max: 100 },
  { name: 'pH 异常', max: 100 },
  { name: '溶氧下降', max: 100 },
]

let radarChart: echarts.ECharts | null = null

function updateRadarChart() {
  if (!radarChart) return
  radarChart.setOption({
    series: [{
      data: [{ value: radarData[activePool.value], name: activePool.value + ' 风险' }],
    }],
  })
}

// ---- 图表 ----
let mainChart: echarts.ECharts | null = null

function rebuildMainChart() {
  if (!mainChart || !mainChartRef.value) return
  mainChart.dispose()
  mainChart = initMainChart()
}

function getThresholdLine(): { yAxis: number; label: string; color: string } | null {
  switch (activeMetric.value) {
    case 'DO': return { yAxis: 4.5, label: 'DO 预警线 4.5', color: '#bf3d35' }
    case 'TEMP': return { yAxis: 28, label: 'TEMP 预警线 28°C', color: '#b7791f' }
    case 'pH': return { yAxis: 8.0, label: 'pH 预警线 8.0', color: '#bf3d35' }
    default: return null
  }
}

function initMainChart(): echarts.ECharts {
  const chart = echarts.init(mainChartRef.value!)
  const m = metricRange.value
  const threshold = getThresholdLine()

  const series: any[] = [
    {
      name: '实测 ' + m.label, type: 'line', data: dataBuffers[activePool.value][activeMetric.value],
      lineStyle: { color: '#256f8f', width: 2 },
      itemStyle: { color: '#256f8f' },
      symbol: 'none', smooth: true,
    },
    {
      name: '置信上界', type: 'line', data: ciUpper,
      lineStyle: { color: 'transparent', width: 0 },
      symbol: 'none',
      stack: 'confidence',
      areaStyle: { color: 'transparent' },
    },
    {
      name: '置信区间', type: 'line', data: ciLower,
      lineStyle: { color: 'transparent', width: 0 },
      symbol: 'none',
      areaStyle: {
        color: 'rgba(183, 121, 31, 0.14)',
      },
    },
    {
      name: '趋势预估', type: 'line', data: doPredicted,
      lineStyle: { color: '#b86525', width: 2, type: 'dotted' },
      itemStyle: { color: '#b86525' },
      symbol: 'none', smooth: true,
    },
    {
      name: '历史同期', type: 'line', data: historySamePeriod,
      lineStyle: { color: '#9aa6b2', width: 1.5, type: 'dashed' },
      itemStyle: { color: '#9aa6b2' },
      symbol: 'none', smooth: true,
    },
  ]

  // 阈值线用 markLine
  if (threshold) {
    series[0].markLine = {
      silent: true, symbol: 'none',
      lineStyle: { color: threshold.color, type: 'dashed', width: 1.5 },
      label: { color: threshold.color, fontSize: 10, formatter: threshold.label, position: 'end' },
      data: [{ yAxis: threshold.yAxis }],
    }
  }

  chart.setOption({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 40, top: 20, bottom: 30 },
    xAxis: {
      type: 'category', data: timeLabels,
      axisLine: { lineStyle: { color: '#c9d3dd' } },
      axisLabel: { color: '#7b8794', fontSize: 10, interval: Math.floor(maxPoints.value / 6) || 1 },
    },
    yAxis: {
      type: 'value', name: m.unit, min: m.min, max: m.max,
      axisLine: { lineStyle: { color: '#c9d3dd' } },
      splitLine: { lineStyle: { color: '#e5eaf0' } },
      axisLabel: { color: '#7b8794', fontSize: 10 },
    },
    series,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: '#7b8794' } },
    },
  })
  return chart
}

function initSmallChart(refEl: HTMLDivElement, name: string, color: string, dataArr: number[], threshold?: { yAxis: number; color: string; label: string }): echarts.ECharts {
  const chart = echarts.init(refEl)
  // Map line color to a restrained solid fill.
  const fillColor = color === '#b86525' ? 'rgba(184,101,37,0.12)'
    : color === '#2f7d57' ? 'rgba(47,125,87,0.12)'
    : 'rgba(37,111,143,0.12)'
  const series: any[] = [{
    type: 'line', data: dataArr,
    lineStyle: { color, width: 1.5 },
    symbol: 'none', smooth: true,
    areaStyle: {
      color: fillColor,
    },
  }]
  if (threshold) {
    series[0].markLine = {
      silent: true, symbol: 'none',
      lineStyle: { color: threshold.color, type: 'dashed', width: 1 },
      label: { color: threshold.color, fontSize: 9, formatter: threshold.label },
      data: [{ yAxis: threshold.yAxis }],
    }
  }
  chart.setOption({
    backgroundColor: 'transparent',
    grid: { left: 40, right: 10, top: 10, bottom: 20 },
    xAxis: { type: 'category', data: timeLabels, show: false },
    yAxis: { type: 'value', name, axisLabel: { color: '#555a6e', fontSize: 9 } },
    series,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: '#7b8794' } },
    },
  })
  return chart
}

// ---- 池切换 ----
function switchPool(poolId: PoolId) {
  activePool.value = poolId
  rebuildMainChart()
  updateRadarChart()
  if (charts[1]) charts[1].setOption({ series: [{ data: [...dataBuffers[poolId].TEMP] }] })
  if (charts[2]) charts[2].setOption({ series: [{ data: [...dataBuffers[poolId].pH] }] })
}

function setTimeRange(seconds: number) {
  timeRange.value = seconds
  for (const poolId of ['P01', 'P02']) {
    for (const key of ['DO', 'TEMP', 'pH', 'NH3N']) {
      const arr = dataBuffers[poolId][key]
      while (arr.length > maxPoints.value) arr.shift()
    }
  }
  while (doPredicted.length > maxPoints.value) doPredicted.shift()
  while (ciUpper.length > maxPoints.value) ciUpper.shift()
  while (ciLower.length > maxPoints.value) ciLower.shift()
  while (historySamePeriod.length > maxPoints.value) historySamePeriod.shift()
  while (timeLabels.length > maxPoints.value) timeLabels.shift()
  rebuildMainChart()
}

// 十字准星同步
function syncCrosshair(params: any) {
  if (!mainChart) return
  const dataIndex = params.dataIndex
  if (dataIndex == null) return
  // 同步三个图表的 tooltip
  ;[mainChart, charts[1], charts[2]].forEach(c => {
    if (c) {
      c.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex })
    }
  })
}

async function triggerPrediction() {
  predicting.value = true
  await new Promise(r => setTimeout(r, 800))

  const timestamp = new Date()
  const timeStr = `${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}`

  const lastVal = dataBuffers[activePool.value][activeMetric.value].slice(-1)[0] || 5
  const predictionDesc = activeMetric.value === 'DO'
    ? `预测未来2h溶氧将降至${(lastVal - 0.8).toFixed(1)}mg/L`
    : activeMetric.value === 'TEMP'
    ? `预测未来2h水温将升至${(lastVal + 1.2).toFixed(1)}°C`
    : `预测未来2h ${metricLabel.value} 变化率 0.12`

  const eventId = 'pred-' + Date.now()
  events.unshift({
    id: eventId,
    time: timeStr,
    type: 'warning',
    poolId: activePool.value,
    title: `趋势预估：${metricLabel.value}`,
    desc: predictionDesc,
    acknowledged: false,
    expanded: false,
    isNew: true,
    threshold: activeMetric.value === 'DO' ? 'DO < 4.5 mg/L' : activeMetric.value === 'TEMP' ? 'TEMP < 28°C' : '—',
    currentValue: `${(lastVal - 0.8).toFixed(1)} ${metricUnit.value}`,
    suggestion: '建议：提前启动增氧设备，提升频率至 75%',
  })

  // 移除 isNew 标记
  setTimeout(() => {
    const ev = events.find(e => e.id === eventId)
    if (ev) ev.isNew = false
  }, 1000)

  // 触发根因高亮
  triggerRootCauseHighlight()

  predicting.value = false
}

// ---- 生命周期 ----
onMounted(() => {
  if (!visiblePools.value.some(pool => pool.id === activePool.value)) {
    activePool.value = firstVisiblePool.value
  }

  const mp = maxPoints.value

  // 预填充数据
  for (let i = mp; i >= 0; i--) {
    const elapsedMin = i * (1000 / 60000)
    timeLabels.push(tickLabel())
    for (const poolId of ['P01', 'P02']) {
      const doBase = poolId === 'P01' ? 5.8 : 5.3
      const tempBase = poolId === 'P01' ? 27.2 : 27.8
      const phBase = poolId === 'P01' ? 7.6 : 7.4
      const nhBase = poolId === 'P01' ? 0.15 : 0.18

      dataBuffers[poolId].DO.push(doBase + Math.sin(elapsedMin / 30 * Math.PI * 2) * 0.6 + (Math.random() - 0.5) * 0.3)
      dataBuffers[poolId].TEMP.push(tempBase + Math.sin(elapsedMin / 720 * Math.PI * 2) * 1.0 + (Math.random() - 0.5) * 0.2)
      dataBuffers[poolId].pH.push(phBase + Math.sin(elapsedMin / 30 * Math.PI * 2) * 0.1 + (Math.random() - 0.5) * 0.05)
      dataBuffers[poolId].NH3N.push(nhBase + (Math.random() - 0.5) * 0.02)
    }
    doPredicted.push(null as any)
    ciUpper.push(null as any)
    ciLower.push(null as any)
    historySamePeriod.push(null as any)
  }

  if (mainChartRef.value) {
    mainChart = initMainChart()
    charts.push(mainChart)
    // 十字准星联动
    mainChart.on('mousemove', syncCrosshair)
  }
  if (tempChartRef.value) charts.push(initSmallChart(tempChartRef.value, '°C', '#b86525', dataBuffers['P01'].TEMP, { yAxis: 28, color: '#b7791f', label: '28°C' }))
  if (phChartRef.value) charts.push(initSmallChart(phChartRef.value, 'pH', '#2f7d57', dataBuffers['P01'].pH, { yAxis: 8.0, color: '#bf3d35', label: 'pH 8.0' }))

  // 雷达图 - 渐变填充
  if (radarChartRef.value) {
    radarChart = echarts.init(radarChartRef.value)
    radarChart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          if (!p.value) return ''
          const vals = p.value as number[]
          return radarIndicators.map((ind, i) => `${ind.name}: <b>${vals[i]}%</b>`).join('<br/>')
        },
      },
      radar: {
        center: ['50%', '50%'], radius: '70%',
        indicator: radarIndicators.map(i => ({ name: i.name, max: i.max })),
        axisName: { color: '#7b8794', fontSize: 9 },
        splitArea: {
          areaStyle: { color: ['#ffffff', '#f8fafc'] },
        },
      },
      series: [{
        type: 'radar', data: [{ value: radarData['P01'], name: 'P01 风险' }],
        areaStyle: {
          color: 'rgba(184, 101, 37, 0.16)',
        },
        lineStyle: { color: '#b86525', width: 2 },
        itemStyle: { color: '#b86525' },
        symbol: 'circle', symbolSize: 5,
      }],
    })
    charts.push(radarChart)
  }

  // 每秒更新
  let tick = 0
  updateTimer = window.setInterval(() => {
    tick++
    const mp = maxPoints.value
    timeLabels.push(tickLabel())
    while (timeLabels.length > mp) timeLabels.shift()

    for (const poolId of ['P01', 'P02']) {
      const doBase = poolId === 'P01' ? 5.8 : 5.3
      const tempBase = poolId === 'P01' ? 27.2 : 27.8
      const phBase = poolId === 'P01' ? 7.6 : 7.4
      const nhBase = poolId === 'P01' ? 0.15 : 0.18

      let doVal: number, tempVal: number, phVal: number, nhVal: number
      const doReading = store.latestReadings.get(`${poolId}-DO`)
      const tempReading = store.latestReadings.get(`${poolId}-TEMP`)
      const phReading = store.latestReadings.get(`${poolId}-pH`)
      const nhReading = store.latestReadings.get(`${poolId}-NH3N`)

      doVal = doReading ? doReading.value : doBase + Math.sin(tick / 30 * Math.PI * 2) * 0.8 + (Math.random() - 0.5) * 0.2 - tick * 0.002
      tempVal = tempReading ? tempReading.value : tempBase + Math.sin(tick / 720 * Math.PI * 2) * 1.0 + (Math.random() - 0.5) * 0.15
      phVal = phReading ? phReading.value : phBase + Math.sin(tick / 30 * Math.PI * 2) * 0.1 + (Math.random() - 0.5) * 0.04
      nhVal = nhReading ? nhReading.value : nhBase + (Math.random() - 0.5) * 0.01 + tick * 0.00002

      rollingPush(dataBuffers[poolId].DO, Math.round(doVal * 100) / 100, mp)
      rollingPush(dataBuffers[poolId].TEMP, Math.round(tempVal * 100) / 100, mp)
      rollingPush(dataBuffers[poolId].pH, Math.round(phVal * 100) / 100, mp)
      rollingPush(dataBuffers[poolId].NH3N, Math.round(nhVal * 100) / 100, mp)
    }

    // 趋势预估 + 波动范围
    const currentData = dataBuffers[activePool.value][activeMetric.value]
    const lastVal = currentData[currentData.length - 1]
    const forecast = lastVal + (Math.sin(tick / 45) - 0.3) * (activeMetric.value === 'DO' ? 0.3 : activeMetric.value === 'TEMP' ? 0.5 : 0.05)
    rollingPush(doPredicted, Math.round(forecast * 100) / 100, mp)

    // 置信区间：随时间扩大
    const horizonPct = tick % 30 / 30
    const ciWidth = 0.15 + horizonPct * 0.5
    rollingPush(ciUpper, Math.round((forecast + ciWidth) * 100) / 100, mp)
    rollingPush(ciLower, Math.round((forecast - ciWidth) * 100) / 100, mp)

    // 历史同期（模拟：略高于当前值）
    const histVal = lastVal + 0.3 + Math.random() * 0.3
    rollingPush(historySamePeriod, Math.round(histVal * 100) / 100, mp)

    // 更新主图
    if (mainChart) {
      mainChart.setOption({
        xAxis: { data: [...timeLabels] },
        series: [
          { data: [...dataBuffers[activePool.value][activeMetric.value]] },
          { data: [...ciUpper] },
          { data: [...ciLower] },
          { data: [...doPredicted] },
          { data: [...historySamePeriod] },
        ],
      })
    }
    if (charts[1]) {
      charts[1].setOption({ xAxis: { data: [...timeLabels] }, series: [{ data: [...dataBuffers[activePool.value].TEMP] }] })
    }
    if (charts[2]) {
      charts[2].setOption({ xAxis: { data: [...timeLabels] }, series: [{ data: [...dataBuffers[activePool.value].pH] }] })
    }
  }, 1000)
})

onUnmounted(() => {
  charts.forEach(c => c.dispose())
  if (updateTimer) clearInterval(updateTimer)
  if (rootCauseTimer) clearTimeout(rootCauseTimer)
})
</script>

<style scoped>
.analysis-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.analysis-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 10px;
  overflow-y: auto;
}
.analysis-sidebar {
  width: 300px;
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 10px;
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.toolbar-label {
  font-size: 10px;
  color: var(--text-dim);
  margin-right: 2px;
}
.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin: 0 4px;
}
.toolbar-spacer {
  flex: 1;
}
.scope-badge {
  padding: 3px 9px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-muted);
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
}
.tb-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.tb-btn:hover { border-color: var(--accent-blue); color: var(--text-primary); }
.tb-btn.active {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
  background: var(--accent-blue-dim);
}
.tb-btn.normal.active { border-color: #b9d7c6; color: var(--accent-green); background: var(--accent-green-dim); }
.tb-btn.unstable.active { border-color: #e7c5a6; color: var(--accent-orange); background: var(--accent-orange-dim); }
.tb-btn.sm { padding: 2px 8px; font-size: 10px; }
.predict-btn {
  border-color: var(--accent-orange);
  color: var(--accent-orange);
}
.predict-btn:hover { background: var(--accent-orange-dim); }
.predict-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tb-dot {
  width: 6px; height: 6px; border-radius: 50%;
  flex-shrink: 0;
}
.tb-dot.normal { background: var(--accent-green); }
.tb-dot.unstable { background: var(--accent-orange); }

.chart-panel { flex: 1; min-height: 0; }
.chart-container { width: 100%; height: 300px; }
.chart-sm { width: 100%; height: 150px; }
.chart-md { width: 100%; height: 220px; }
.bottom-charts { display: flex; gap: 10px; }
.half { flex: 1; }
.chart-legend { display: flex; gap: 12px; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text-dim); }
.legend-dot { width: 10px; height: 3px; border-radius: 1px; }
.legend-dot.actual { background: var(--accent-blue); }
.legend-dot.predicted { background: var(--accent-orange); }
.legend-dot.ci { background: var(--accent-yellow); }
.legend-dot.history { background: var(--text-dim); }

.panel-sub { font-size: 10px; color: var(--text-dim); margin-left: 8px; }

/* 根因分析 */
.root-cause { display: flex; flex-direction: column; gap: 10px; }
.cause-item { display: flex; gap: 10px; align-items: flex-start; }
.cause-icon {
  width: 26px; height: 26px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;
  background: var(--accent-red); color: #fff;
  transition: transform 0.3s;
}
.cause-icon.sec { background: var(--accent-orange-dim); color: var(--accent-orange); }
.cause-icon.pulse {
  animation: heartbeat 0.5s ease-in-out 3;
}
.cause-item.primary .cause-title { color: var(--accent-red); }
.cause-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.cause-desc { font-size: 11px; color: var(--text-dim); line-height: 1.5; }

/* 事件时间轴 */
.event-timeline { display: flex; flex-direction: column; gap: 0; }
.event-item {
  display: flex; gap: 8px; padding: 8px 4px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer; transition: background 0.15s;
  border-radius: 4px;
}
.event-item:hover { background: var(--bg-muted); }
.event-item.acknowledged { opacity: 0.45; }
.event-item.shake { animation: shake 0.5s ease-in-out; }
.event-item.expanded { background: var(--accent-blue-dim); }
.event-time { font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); min-width: 34px; flex-shrink: 0; }
.event-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.event-dot.warning { background: var(--accent-orange); }
.event-dot.danger { background: var(--accent-red); }
.event-dot.info { background: var(--accent-blue); }
.event-dot.action { background: var(--accent-green); }
.event-content { flex: 1; min-width: 0; }
.event-title { font-size: 11px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.event-desc { font-size: 10px; color: var(--text-dim); line-height: 1.4; }
.event-detail {
  margin-top: 8px; padding: 8px; background: #ffffff;
  border-radius: 6px; border: 1px solid var(--border-color);
  animation: fade-in 0.2s ease;
}
.event-meta { display: flex; gap: 16px; font-size: 10px; color: var(--text-secondary); margin-bottom: 4px; }
.event-meta span { font-family: var(--font-mono); }
.event-suggestion { font-size: 10px; color: var(--accent-orange); }
.ack-badge {
  font-size: 9px; padding: 0 4px; border-radius: 3px;
  background: var(--accent-green-dim); color: var(--accent-green);
}
</style>

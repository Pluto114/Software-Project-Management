<template>
  <div class="analysis-layout">
    <!-- 主图表区 -->
    <main class="analysis-main">
      <!-- 交互工具栏 -->
      <div class="toolbar">
        <div class="toolbar-group">
          <span class="toolbar-label">养殖池</span>
          <button
            v-for="p in pools"
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

        <button class="tb-btn predict-btn" @click="triggerPrediction" :disabled="predicting">
          <span class="predict-icon">{{ predicting ? '⏳' : '⚡' }}</span>
          {{ predicting ? '预测中...' : 'AI 即时预测' }}
        </button>
      </div>

      <div class="panel chart-panel">
        <div class="panel-header">
          <span class="panel-title">
            {{ activePool === 'P01' ? '#01' : '#02' }} 池 {{ metricLabel }} 时序视图
          </span>
          <div class="chart-legend">
            <span class="legend-item"><span class="legend-dot actual"></span> 实测</span>
            <span class="legend-item"><span class="legend-dot predicted"></span> AI 预测</span>
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
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">根因分析钻取</span>
          <button class="tb-btn sm" @click="refreshRootCauses">刷新</button>
        </div>
        <div class="root-cause">
          <div
            class="cause-item"
            v-for="(cause, i) in currentCauses"
            :key="i"
            :class="{ primary: i === 0 }"
          >
            <span class="cause-icon" :class="i > 0 ? 'sec' : ''">{{ i === 0 ? '!' : i + 1 }}</span>
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
            :class="{ acknowledged: e.acknowledged }"
            @click="acknowledgeEvent(e.id)"
          >
            <div class="event-time">{{ e.time }}</div>
            <div class="event-dot" :class="e.type"></div>
            <div class="event-content">
              <div class="event-title">
                {{ e.title }}
                <span v-if="e.acknowledged" class="ack-badge">已确认</span>
              </div>
              <div class="event-desc">{{ e.desc }}</div>
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

const mainChartRef = ref<HTMLDivElement>()
const tempChartRef = ref<HTMLDivElement>()
const phChartRef = ref<HTMLDivElement>()
const radarChartRef = ref<HTMLDivElement>()

const store = useSensorStore()

let charts: echarts.ECharts[] = []
let updateTimer: number | null = null

// ---- 交互状态 ----
const pools = [
  { id: 'P01', name: '南美白对虾', riskLevel: 'normal' },
  { id: 'P02', name: '南美白对虾', riskLevel: 'unstable' },
] as const
const activePool = ref<'P01' | 'P02'>('P01')

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
]
const timeRange = ref(120)
const maxPoints = computed(() => timeRanges.value === 30 ? 30 : timeRanges.value === 120 ? 120 : 300)

const predicting = ref(false)

// ---- 数据缓冲 (按池 + 指标) ----
const dataBuffers: Record<string, Record<string, number[]>> = {
  P01: { DO: [], TEMP: [], pH: [], NH3N: [] },
  P02: { DO: [], TEMP: [], pH: [], NH3N: [] },
}
const doPredicted: number[] = []
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
  type: 'warning' | 'info' | 'action'
  poolId: string
  title: string
  desc: string
  acknowledged: boolean
}

const events = reactive<TimelineEvent[]>([
  { id: 'e1', time: '18:32', type: 'warning', poolId: 'P02', title: 'AI 预测 DO 下降', desc: 'LSTM 模型预测未来2h溶氧降至4.3mg/L', acknowledged: false },
  { id: 'e2', time: '17:45', type: 'warning', poolId: 'P02', title: 'pH 变化率异常', desc: '小时变化率 0.15，超过正常范围', acknowledged: false },
  { id: 'e3', time: '16:10', type: 'info', poolId: 'P01', title: '增氧机维护完成', desc: '#02 增氧机例行维护，电流恢复正常', acknowledged: false },
  { id: 'e4', time: '14:20', type: 'warning', poolId: 'P01', title: '水温超阈值', desc: '水温达 28.2°C，超过 28°C 黄色预警线', acknowledged: false },
  { id: 'e5', time: '12:05', type: 'action', poolId: 'P01', title: '预防性增氧启动', desc: 'AI 触发预干预：增氧机频率自动提升 15%', acknowledged: false },
  { id: 'e6', time: '10:30', type: 'info', poolId: 'P02', title: '气象数据更新', desc: '获取到高德气象API数据：夜间气压将下降', acknowledged: false },
  { id: 'e7', time: '08:15', type: 'action', poolId: 'P02', title: '投喂窗口建议', desc: 'AI 建议 08:30-09:00 投喂，代谢强度 0.72', acknowledged: false },
])

const filteredEvents = computed(() =>
  events.filter(e => e.poolId === activePool.value)
)

function acknowledgeEvent(id: string) {
  const e = events.find(ev => ev.id === id)
  if (e) e.acknowledged = !e.acknowledged
}

function clearAcknowledged() {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].acknowledged) events.splice(i, 1)
  }
}

// ---- 根因分析 (动态) ----
const rootCauseConfigs: Record<string, Array<{title: string; desc: string}>> = {
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
  // 重建雷达图数据
  updateRadarChart()
}

// ---- 雷达图数据 ----
const radarData: Record<string, number[]> = {
  P01: [25, 30, 29, 18, 40],
  P02: [45, 38, 33, 25, 58],
}

let radarChart: echarts.ECharts | null = null

function updateRadarChart() {
  if (!radarChart) return
  radarChart.setOption({
    series: [{ data: [{ value: radarData[activePool.value], name: activePool.value + ' 风险' }] }],
  })
}

// ---- 图表初始化 ----
let mainChart: echarts.ECharts | null = null

function rebuildMainChart() {
  if (!mainChart || !mainChartRef.value) return
  mainChart.dispose()
  mainChart = initMainChart()
}

function initMainChart(): echarts.ECharts {
  const chart = echarts.init(mainChartRef.value!, 'dark')
  const m = metricRange.value
  chart.setOption({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 30, top: 20, bottom: 30 },
    xAxis: {
      type: 'category', data: timeLabels,
      axisLine: { lineStyle: { color: '#2A3040' } },
      axisLabel: { color: '#555A62', fontSize: 10, interval: Math.floor(maxPoints.value / 6) || 1 },
    },
    yAxis: {
      type: 'value', name: m.unit, min: m.min, max: m.max,
      axisLine: { lineStyle: { color: '#2A3040' } },
      splitLine: { lineStyle: { color: '#1E2229' } },
      axisLabel: { color: '#555A62', fontSize: 10 },
    },
    series: [
      {
        name: '实测 ' + m.label, type: 'line', data: dataBuffers[activePool.value][activeMetric.value],
        lineStyle: { color: '#00F2FF', width: 2 },
        itemStyle: { color: '#00F2FF' },
        symbol: 'none', smooth: true,
      },
      {
        name: 'AI 预测', type: 'line', data: doPredicted,
        lineStyle: { color: '#FF8C00', width: 2, type: 'dotted' },
        itemStyle: { color: '#FF8C00' },
        symbol: 'none', smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 140, 0, 0.2)' },
            { offset: 1, color: 'rgba(255, 140, 0, 0.02)' },
          ]),
        },
      },
      {
        name: '预警线', type: 'line',
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: '#FF4444', type: 'dashed', width: 1 },
          label: { color: '#FF4444', fontSize: 10, formatter: '预警 {c}' },
          data: [{
            yAxis: activeMetric.value === 'DO' ? 4.5 : activeMetric.value === 'TEMP' ? 28.5 : activeMetric.value === 'pH' ? 8.0 : 0.3,
          }],
        },
        data: [],
      },
    ],
    tooltip: { trigger: 'axis' },
  })
  return chart
}

function initSmallChart(refEl: HTMLDivElement, name: string, color: string, dataArr: number[]): echarts.ECharts {
  const chart = echarts.init(refEl, 'dark')
  chart.setOption({
    backgroundColor: 'transparent',
    grid: { left: 40, right: 10, top: 10, bottom: 20 },
    xAxis: { type: 'category', data: timeLabels, show: false },
    yAxis: { type: 'value', name, axisLabel: { color: '#555A62', fontSize: 9 } },
    series: [{
      type: 'line', data: dataArr,
      lineStyle: { color, width: 1.5 },
      symbol: 'none', smooth: true,
      areaStyle: { color: `rgba(${color === '#FF8C00' ? '255,140,0' : '0,230,118'}, 0.1)` },
    }],
  })
  return chart
}

// ---- 池切换 ----
function switchPool(poolId: 'P01' | 'P02') {
  activePool.value = poolId
  rebuildMainChart()
  updateRadarChart()
  // 小图数据也切换
  if (charts[1]) charts[1].setOption({ series: [{ data: [...dataBuffers[poolId].TEMP] }] })
  if (charts[2]) charts[2].setOption({ series: [{ data: [...dataBuffers[poolId].pH] }] })
}

function setTimeRange(seconds: number) {
  timeRange.value = seconds
  // 裁剪已有数据
  for (const poolId of ['P01', 'P02']) {
    for (const key of ['DO', 'TEMP', 'pH', 'NH3N']) {
      const arr = dataBuffers[poolId][key]
      while (arr.length > maxPoints.value) arr.shift()
    }
  }
  while (doPredicted.length > maxPoints.value) doPredicted.shift()
  while (timeLabels.length > maxPoints.value) timeLabels.shift()
  rebuildMainChart()
}

async function triggerPrediction() {
  predicting.value = true
  // 模拟 AI 推理延迟
  await new Promise(r => setTimeout(r, 800))

  const timestamp = new Date()
  const timeStr = `${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}`

  const lastVal = dataBuffers[activePool.value][activeMetric.value].slice(-1)[0] || 5
  const predictionDesc = activeMetric.value === 'DO'
    ? `预测未来2h溶氧将降至${(lastVal - 0.8).toFixed(1)}mg/L`
    : activeMetric.value === 'TEMP'
    ? `预测未来2h水温将升至${(lastVal + 1.2).toFixed(1)}°C`
    : `预测未来2h ${metricLabel.value} 变化率 0.12`

  events.unshift({
    id: 'pred-' + Date.now(),
    time: timeStr,
    type: 'warning',
    poolId: activePool.value,
    title: `AI 即时预测: ${metricLabel.value}`,
    desc: predictionDesc,
    acknowledged: false,
  })

  predicting.value = false
}

// ---- 生命周期 ----
onMounted(() => {
  const mp = maxPoints.value

  // 预填充历史数据
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
  }

  if (mainChartRef.value) {
    mainChart = initMainChart()
    charts.push(mainChart)
  }
  if (tempChartRef.value) charts.push(initSmallChart(tempChartRef.value, '°C', '#FF8C00', dataBuffers['P01'].TEMP))
  if (phChartRef.value) charts.push(initSmallChart(phChartRef.value, 'pH', '#00E676', dataBuffers['P01'].pH))

  // 雷达图
  if (radarChartRef.value) {
    radarChart = echarts.init(radarChartRef.value, 'dark')
    radarChart.setOption({
      backgroundColor: 'transparent',
      radar: {
        center: ['50%', '50%'], radius: '70%',
        indicator: [
          { name: '气压突变', max: 100 }, { name: '氨氮累积', max: 100 },
          { name: '水温变化', max: 100 }, { name: 'pH 异常', max: 100 },
          { name: '溶氧下降', max: 100 },
        ],
        axisName: { color: '#8B909A', fontSize: 9 },
        splitArea: { areaStyle: { color: ['rgba(0,242,255,0.02)', 'rgba(0,242,255,0.04)'] } },
      },
      series: [{
        type: 'radar', data: [{ value: radarData['P01'], name: 'P01 风险' }],
        areaStyle: { color: 'rgba(255, 140, 0, 0.25)' },
        lineStyle: { color: '#FF8C00' }, itemStyle: { color: '#FF8C00' },
        symbol: 'circle', symbolSize: 4,
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

      // 读取 store 或生成趋势
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

    // AI 预测 (基于当前池当前指标)
    const currentData = dataBuffers[activePool.value][activeMetric.value]
    const lastVal = currentData[currentData.length - 1]
    const forecast = lastVal + (Math.sin(tick / 45) - 0.3) * (activeMetric.value === 'DO' ? 0.3 : activeMetric.value === 'TEMP' ? 0.5 : 0.05)
    rollingPush(doPredicted, Math.round(forecast * 100) / 100, mp)

    // 更新主图
    if (mainChart) {
      mainChart.setOption({
        xAxis: { data: [...timeLabels] },
        series: [
          { data: [...dataBuffers[activePool.value][activeMetric.value]] },
          { data: [...doPredicted] },
          {},
        ],
      })
    }
    // 更新小图
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
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
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
.tb-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
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
  background: rgba(0, 242, 255, 0.08);
}
.tb-btn.normal.active { border-color: var(--accent-green); color: var(--accent-green); background: rgba(0, 230, 118, 0.08); }
.tb-btn.unstable.active { border-color: var(--accent-orange); color: var(--accent-orange); background: rgba(255, 140, 0, 0.08); }
.tb-btn.sm { padding: 1px 6px; font-size: 10px; }
.predict-btn {
  border-color: var(--accent-orange);
  color: var(--accent-orange);
}
.predict-btn:hover { background: rgba(255, 140, 0, 0.1); }
.predict-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.predict-icon { font-size: 13px; }
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
.chart-legend { display: flex; gap: 14px; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-dim); }
.legend-dot { width: 10px; height: 3px; border-radius: 1px; }
.legend-dot.actual { background: var(--accent-blue); }
.legend-dot.predicted { background: var(--accent-orange); }
.legend-dot.history { background: var(--text-dim); }

.panel-sub { font-size: 10px; color: var(--text-dim); margin-left: 8px; }

/* 根因分析 */
.root-cause { display: flex; flex-direction: column; gap: 10px; }
.cause-item { display: flex; gap: 10px; align-items: flex-start; }
.cause-icon {
  width: 24px; height: 24px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;
  background: var(--accent-red); color: #fff;
}
.cause-icon.sec { background: var(--accent-orange-dim); color: var(--accent-orange); }
.cause-item.primary .cause-title { color: var(--accent-red); }
.cause-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.cause-desc { font-size: 11px; color: var(--text-dim); }

/* 事件时间轴 */
.event-timeline { display: flex; flex-direction: column; gap: 0; }
.event-item {
  display: flex; gap: 8px; padding: 6px 0;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer; transition: background 0.15s;
  border-radius: 4px; padding: 6px 4px;
}
.event-item:hover { background: rgba(255, 255, 255, 0.03); }
.event-item.acknowledged { opacity: 0.45; }
.event-time { font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); min-width: 34px; }
.event-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.event-dot.warning { background: var(--accent-orange); }
.event-dot.info { background: var(--accent-blue); }
.event-dot.action { background: var(--accent-green); }
.event-title { font-size: 11px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px; }
.event-desc { font-size: 10px; color: var(--text-dim); }
.ack-badge {
  font-size: 9px; padding: 0 4px; border-radius: 3px;
  background: rgba(0, 230, 118, 0.15); color: var(--accent-green);
}
</style>

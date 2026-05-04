<template>
  <div class="analysis-layout">
    <!-- 主图表区 -->
    <main class="analysis-main">
      <div class="panel chart-panel">
        <div class="panel-header">
          <span class="panel-title">多维时序对比视图</span>
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
          </div>
          <div ref="tempChartRef" class="chart-sm"></div>
        </div>
        <div class="panel half">
          <div class="panel-header">
            <span class="panel-title">pH 变化</span>
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
        </div>
        <div class="root-cause">
          <div class="cause-item primary">
            <span class="cause-icon">!</span>
            <div>
              <div class="cause-title">气压骤降 5%</div>
              <div class="cause-desc">主要原因：气压突变导致溶氧预测下滑</div>
            </div>
          </div>
          <div class="cause-item">
            <span class="cause-icon sec">2</span>
            <div>
              <div class="cause-title">氨氮累积上升</div>
              <div class="cause-desc">次要因素：底层残饵分解加速</div>
            </div>
          </div>
          <div class="cause-item">
            <span class="cause-icon sec">3</span>
            <div>
              <div class="cause-title">水温日较差增大</div>
              <div class="cause-desc">关联因子：傍晚降温 3°C</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 雷达图 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">风险因子权重</span>
        </div>
        <div ref="radarChartRef" class="chart-md"></div>
      </div>

      <!-- 历史事件时间轴 -->
      <div class="panel" style="flex: 1; overflow-y: auto;">
        <div class="panel-header">
          <span class="panel-title">历史事件时间轴</span>
        </div>
        <div class="event-timeline">
          <div class="event-item" v-for="e in events" :key="e.time">
            <div class="event-time">{{ e.time }}</div>
            <div class="event-dot" :class="e.type"></div>
            <div class="event-content">
              <div class="event-title">{{ e.title }}</div>
              <div class="event-desc">{{ e.desc }}</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { useSensorStore } from '../stores/sensorData'

const mainChartRef = ref<HTMLDivElement>()
const tempChartRef = ref<HTMLDivElement>()
const phChartRef = ref<HTMLDivElement>()
const radarChartRef = ref<HTMLDivElement>()

const store = useSensorStore()

let charts: echarts.ECharts[] = []
let updateTimer: number | null = null

// 滚动数据缓冲 (最近 120 个点 = 2 分钟实时)
const MAX_POINTS = 120
const doActual: number[] = []
const doPredicted: number[] = []
const tempData: number[] = []
const phData: number[] = []
const timeLabels: string[] = []

function tickLabel(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
}

function rollingPush(arr: number[], val: number) {
  arr.push(val)
  if (arr.length > MAX_POINTS) arr.shift()
}

function initMainChart(): echarts.ECharts {
  const chart = echarts.init(mainChartRef.value!, 'dark')
  chart.setOption({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 30, top: 20, bottom: 30 },
    xAxis: {
      type: 'category', data: timeLabels,
      axisLine: { lineStyle: { color: '#2A3040' } },
      axisLabel: { color: '#555A62', fontSize: 10, interval: 19 },
    },
    yAxis: {
      type: 'value', name: 'DO (mg/L)', min: 2, max: 9,
      axisLine: { lineStyle: { color: '#2A3040' } },
      splitLine: { lineStyle: { color: '#1E2229' } },
      axisLabel: { color: '#555A62', fontSize: 10 },
    },
    series: [
      {
        name: '实测 DO', type: 'line', data: doActual,
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
          label: { color: '#FF4444', fontSize: 10, formatter: '预警 {c} mg/L' },
          data: [{ yAxis: 4.5 }],
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

onMounted(() => {
  // 预填充一些历史数据
  const now = Date.now()
  for (let i = MAX_POINTS; i >= 0; i--) {
    const elapsedMin = i * (1000 / 60000)
    timeLabels.push(tickLabel())
    doActual.push(5.8 + Math.sin(elapsedMin / 30 * Math.PI * 2) * 0.6 + (Math.random() - 0.5) * 0.3)
    doPredicted.push(null as any)
    tempData.push(27.2 + Math.sin(elapsedMin / 720 * Math.PI * 2) * 1.0 + (Math.random() - 0.5) * 0.2)
    phData.push(7.6 + Math.sin(elapsedMin / 30 * Math.PI * 2) * 0.1 + (Math.random() - 0.5) * 0.05)
  }

  if (mainChartRef.value) charts.push(initMainChart())
  if (tempChartRef.value) charts.push(initSmallChart(tempChartRef.value, '°C', '#FF8C00', tempData))
  if (phChartRef.value) charts.push(initSmallChart(phChartRef.value, 'pH', '#00E676', phData))

  // 雷达图 (静态展示)
  if (radarChartRef.value) {
    const chart = echarts.init(radarChartRef.value, 'dark')
    chart.setOption({
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
        type: 'radar', data: [{ value: [38, 33, 29, 22, 55], name: '当前风险' }],
        areaStyle: { color: 'rgba(255, 140, 0, 0.25)' },
        lineStyle: { color: '#FF8C00' }, itemStyle: { color: '#FF8C00' },
        symbol: 'circle', symbolSize: 4,
      }],
    })
    charts.push(chart)
  }

  // 每秒更新图表
  let tick = 0
  updateTimer = window.setInterval(() => {
    tick++
    timeLabels.push(tickLabel())
    if (timeLabels.length > MAX_POINTS) timeLabels.shift()

    // 从 store 读取最新值，或生成趋势数据
    let doVal = 5.8
    let tempVal = 27.2
    let phVal = 7.6

    const doReading = store.latestReadings.get('P01-DO') || store.latestReadings.get('pool-01-DO')
    const tempReading = store.latestReadings.get('P01-TEMP') || store.latestReadings.get('pool-01-TEMP')
    const phReading = store.latestReadings.get('P01-pH') || store.latestReadings.get('pool-01-pH')

    if (doReading) doVal = doReading.value
    else doVal = 5.8 + Math.sin(tick / 30 * Math.PI * 2) * 0.8 + (Math.random() - 0.5) * 0.2 - tick * 0.002

    if (tempReading) tempVal = tempReading.value
    else tempVal = 27.2 + Math.sin(tick / 720 * Math.PI * 2) * 1.0 + (Math.random() - 0.5) * 0.15

    if (phReading) phVal = phReading.value
    else phVal = 7.6 + Math.sin(tick / 30 * Math.PI * 2) * 0.1 + (Math.random() - 0.5) * 0.04

    rollingPush(doActual, Math.round(doVal * 100) / 100)
    // AI 预测: 未来趋势 (基于当前值 + 模拟下降)
    const lastDO = doActual[doActual.length - 1]
    const forecast = lastDO + (Math.sin(tick / 45) - 0.3) * 0.3
    rollingPush(doPredicted, Math.round(forecast * 100) / 100)

    rollingPush(tempData, Math.round(tempVal * 100) / 100)
    rollingPush(phData, Math.round(phVal * 100) / 100)

    // 更新图表
    for (const chart of charts) {
      const opt = chart.getOption()
      if (opt.xAxis && Array.isArray(opt.xAxis)) {
        // ECharts 4.x
        ;(opt.xAxis as any[])[0].data = timeLabels
      }
      chart.setOption({
        xAxis: { data: timeLabels },
        series: [
          { data: [...doActual] },
          { data: [...doPredicted] },
          {},
        ],
      }, false)
      // 按索引更新每个 chart
    }
    // 逐 chart 更新
    if (charts[0]) {
      charts[0].setOption({
        xAxis: { data: [...timeLabels] },
        series: [{ data: [...doActual] }, { data: [...doPredicted] }, {}],
      })
    }
    if (charts[1]) {
      charts[1].setOption({ xAxis: { data: [...timeLabels] }, series: [{ data: [...tempData] }] })
    }
    if (charts[2]) {
      charts[2].setOption({ xAxis: { data: [...timeLabels] }, series: [{ data: [...phData] }] })
    }
  }, 1000)
})

onUnmounted(() => {
  charts.forEach(c => c.dispose())
  if (updateTimer) clearInterval(updateTimer)
})

const events = [
  { time: '18:32', type: 'warning', title: 'AI 预测 DO 下降', desc: 'LSTM 模型预测未来2h溶氧降至4.3mg/L' },
  { time: '17:45', type: 'warning', title: 'pH 变化率异常', desc: '小时变化率 0.15，超过正常范围' },
  { time: '16:10', type: 'info', title: '增氧机维护完成', desc: '#02 增氧机例行维护，电流恢复正常' },
  { time: '14:20', type: 'warning', title: '水温超阈值', desc: '水温达 28.2°C，超过 28°C 黄色预警线' },
  { time: '12:05', type: 'action', title: '预防性增氧启动', desc: 'AI 触发预干预：增氧机频率自动提升 15%' },
  { time: '10:30', type: 'info', title: '气象数据更新', desc: '获取到高德气象API数据：夜间气压将下降' },
  { time: '08:15', type: 'action', title: '投喂窗口建议', desc: 'AI 建议 08:30-09:00 投喂，代谢强度 0.72' },
]
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

/* 根因分析 */
.root-cause { display: flex; flex-direction: column; gap: 10px; }
.cause-item { display: flex; gap: 10px; align-items: flex-start; }
.cause-icon {
  width: 24px; height: 24px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.cause-icon { background: var(--accent-red); color: #fff; }
.cause-icon.sec { background: var(--accent-orange-dim); color: var(--accent-orange); }
.cause-item.primary .cause-title { color: var(--accent-red); }
.cause-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.cause-desc { font-size: 11px; color: var(--text-dim); }

/* 事件时间轴 */
.event-timeline { display: flex; flex-direction: column; gap: 0; }
.event-item { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-color); }
.event-time { font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); min-width: 34px; }
.event-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.event-dot.warning { background: var(--accent-orange); }
.event-dot.info { background: var(--accent-blue); }
.event-dot.action { background: var(--accent-green); }
.event-title { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.event-desc { font-size: 10px; color: var(--text-dim); }
</style>

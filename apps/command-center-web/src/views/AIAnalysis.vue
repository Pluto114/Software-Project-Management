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

const mainChartRef = ref<HTMLDivElement>()
const tempChartRef = ref<HTMLDivElement>()
const phChartRef = ref<HTMLDivElement>()
const radarChartRef = ref<HTMLDivElement>()

let charts: echarts.ECharts[] = []

function generateTimeLabels(hours: number, intervalMin: number) {
  const now = new Date()
  const labels: string[] = []
  for (let i = (hours * 60) / intervalMin; i >= 0; i--) {
    const t = new Date(now.getTime() - i * intervalMin * 60000)
    labels.push(`${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`)
  }
  return labels
}

function generateSeriesData(len: number, base: number, noise: number, trend: number) {
  const data: number[] = []
  for (let i = 0; i < len; i++) {
    data.push(+(base + (Math.random() - 0.5) * noise + trend * (i / len)).toFixed(2))
  }
  return data
}

onMounted(() => {
  if (mainChartRef.value) {
    const chart = echarts.init(mainChartRef.value, 'dark')
    const labels = generateTimeLabels(6, 5) // 过去6h + 未来2h
    const historicalEnd = labels.length - 24
    const actualLen = labels.length - 24 // 过去6h实测

    const actualData = generateSeriesData(actualLen, 6.0, 0.8, -1.2)
    const predictedData = generateSeriesData(24, 5.2, 0.3, -0.6)
    const historyData = generateSeriesData(labels.length, 6.5, 0.6, -0.3)

    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 50, right: 30, top: 20, bottom: 30 },
      xAxis: {
        type: 'category', data: labels,
        axisLine: { lineStyle: { color: '#2A3040' } },
        axisLabel: { color: '#555A62', fontSize: 10 },
      },
      yAxis: {
        type: 'value', name: 'DO (mg/L)', min: 3, max: 9,
        axisLine: { lineStyle: { color: '#2A3040' } },
        splitLine: { lineStyle: { color: '#1E2229' } },
        axisLabel: { color: '#555A62', fontSize: 10 },
      },
      series: [
        {
          name: '实测', type: 'line', data: actualData,
          lineStyle: { color: '#00F2FF', width: 2 },
          itemStyle: { color: '#00F2FF' },
          symbol: 'none', smooth: true,
        },
        {
          name: '历史同期', type: 'line', data: historyData,
          lineStyle: { color: '#555A62', width: 1, type: 'dashed' },
          itemStyle: { color: '#555A62' },
          symbol: 'none', smooth: true,
        },
        {
          name: 'AI 预测', type: 'line',
          data: [...new Array(actualLen).fill(null), ...predictedData],
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
        // 预警线
        {
          name: '预警线', type: 'line',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#FF4444', type: 'dashed', width: 1 },
            label: { color: '#FF4444', fontSize: 10, formatter: '预警 {c} mg/L' },
            data: [{ yAxis: 4.5 }],
          },
          data: [],
        },
      ],
      tooltip: { trigger: 'axis' },
    })
    charts.push(chart)
  }

  // 水温小图
  if (tempChartRef.value) {
    const chart = echarts.init(tempChartRef.value, 'dark')
    const labels = generateTimeLabels(6, 10)
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 40, right: 10, top: 10, bottom: 20 },
      xAxis: { type: 'category', data: labels, show: false },
      yAxis: { type: 'value', name: '°C', axisLabel: { color: '#555A62', fontSize: 9 } },
      series: [{
        type: 'line', data: generateSeriesData(labels.length, 27, 1.5, 0.5),
        lineStyle: { color: '#FF8C00', width: 1.5 },
        symbol: 'none', smooth: true,
        areaStyle: { color: 'rgba(255, 140, 0, 0.1)' },
      }],
    })
    charts.push(chart)
  }

  // pH 小图
  if (phChartRef.value) {
    const chart = echarts.init(phChartRef.value, 'dark')
    const labels = generateTimeLabels(6, 10)
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 40, right: 10, top: 10, bottom: 20 },
      xAxis: { type: 'category', data: labels, show: false },
      yAxis: { type: 'value', name: 'pH', axisLabel: { color: '#555A62', fontSize: 9 } },
      series: [{
        type: 'line', data: generateSeriesData(labels.length, 7.4, 0.3, 0.15),
        lineStyle: { color: '#00E676', width: 1.5 },
        symbol: 'none', smooth: true,
        areaStyle: { color: 'rgba(0, 230, 118, 0.1)' },
      }],
    })
    charts.push(chart)
  }

  // 雷达图
  if (radarChartRef.value) {
    const chart = echarts.init(radarChartRef.value, 'dark')
    chart.setOption({
      backgroundColor: 'transparent',
      radar: {
        center: ['50%', '50%'],
        radius: '70%',
        indicator: [
          { name: '气压突变', max: 100 },
          { name: '氨氮累积', max: 100 },
          { name: '水温变化', max: 100 },
          { name: 'pH 异常', max: 100 },
          { name: '溶氧下降', max: 100 },
        ],
        axisName: { color: '#8B909A', fontSize: 9 },
        splitArea: { areaStyle: { color: ['rgba(0,242,255,0.02)', 'rgba(0,242,255,0.04)'] } },
      },
      series: [{
        type: 'radar',
        data: [{ value: [38, 33, 29, 22, 55], name: '当前风险' }],
        areaStyle: { color: 'rgba(255, 140, 0, 0.25)' },
        lineStyle: { color: '#FF8C00' },
        itemStyle: { color: '#FF8C00' },
        symbol: 'circle', symbolSize: 4,
      }],
    })
    charts.push(chart)
  }
})

onUnmounted(() => charts.forEach(c => c.dispose()))

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

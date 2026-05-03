<template>
  <div class="ceo-layout">
    <!-- 顶部 KPI 指标卡 -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">总养殖池数</div>
        <div class="kpi-value">8<span class="kpi-unit">池</span></div>
        <div class="kpi-sub">2 个基地 · 全部在线</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">存池鱼群总值</div>
        <div class="kpi-value">486<span class="kpi-unit">万元</span></div>
        <div class="kpi-sub green">同比 +12.3%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">本月 FCR</div>
        <div class="kpi-value">1.32<span class="kpi-unit"></span></div>
        <div class="kpi-sub green">优于目标 8%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">本月能耗</div>
        <div class="kpi-value">8,420<span class="kpi-unit">kWh</span></div>
        <div class="kpi-sub">较上月 -5.6%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">AI 预警处置率</div>
        <div class="kpi-value">98.5<span class="kpi-unit">%</span></div>
        <div class="kpi-sub green">1 条待处理</div>
      </div>
    </div>

    <!-- 主图表区 -->
    <div class="ceo-charts">
      <div class="panel chart-box">
        <div class="panel-header">
          <span class="panel-title">成本-收益趋势（近 30 天）</span>
        </div>
        <div ref="profitChartRef" class="chart-lg"></div>
      </div>
      <div class="panel chart-box">
        <div class="panel-header">
          <span class="panel-title">各基地能耗分布</span>
        </div>
        <div ref="energyChartRef" class="chart-lg"></div>
      </div>
    </div>

    <!-- 底部表格 + 饼图 -->
    <div class="ceo-bottom">
      <div class="panel table-box">
        <div class="panel-header">
          <span class="panel-title">养殖池资产总览</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>池号</th><th>基地</th><th>鱼种</th><th>存池量</th><th>DO</th><th>FCR</th><th>风险</th><th>估损</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in poolData" :key="row.id">
              <td class="pool-id">{{ row.id }}</td>
              <td>{{ row.base }}</td>
              <td>{{ row.breed }}</td>
              <td>{{ row.count }}尾</td>
              <td><span :class="row.do < 5 ? 'text-warn' : 'text-ok'">{{ row.do }} mg/L</span></td>
              <td>{{ row.fcr }}</td>
              <td><span class="status-dot" :class="row.risk"></span> {{ row.riskText }}</td>
              <td class="text-mono">{{ row.estimatedLoss }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="panel pie-box">
        <div class="panel-header">
          <span class="panel-title">成本构成分析</span>
        </div>
        <div ref="pieChartRef" class="chart-md"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const profitChartRef = ref<HTMLDivElement>()
const energyChartRef = ref<HTMLDivElement>()
const pieChartRef = ref<HTMLDivElement>()
let charts: echarts.ECharts[] = []

onMounted(() => {
  // 成本-收益趋势
  if (profitChartRef.value) {
    const chart = echarts.init(profitChartRef.value, 'dark')
    const days = Array.from({ length: 30 }, (_, i) => `${i + 1}日`)
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 55, right: 55, top: 10, bottom: 25 },
      xAxis: { type: 'category', data: days, axisLabel: { color: '#555A62', fontSize: 9 }, axisLine: { lineStyle: { color: '#2A3040' } } },
      yAxis: [
        { type: 'value', name: '万元', axisLabel: { color: '#555A62' }, splitLine: { lineStyle: { color: '#1E2229' } } },
        { type: 'value', name: '%', axisLabel: { color: '#555A62' } },
      ],
      series: [
        {
          name: '饲料成本', type: 'bar', stack: 'cost',
          data: Array.from({ length: 30 }, () => +(2 + Math.random()).toFixed(1)),
          itemStyle: { color: '#00F2FF', borderRadius: [0, 0, 0, 0] },
        },
        {
          name: '能耗成本', type: 'bar', stack: 'cost',
          data: Array.from({ length: 30 }, () => +(1 + Math.random() * 0.8).toFixed(1)),
          itemStyle: { color: '#1a5a6a' },
        },
        {
          name: '人工成本', type: 'bar', stack: 'cost',
          data: Array.from({ length: 30 }, () => +(0.8 + Math.random() * 0.4).toFixed(1)),
          itemStyle: { color: '#0d3038' },
        },
        {
          name: '利润率', type: 'line', yAxisIndex: 1,
          data: Array.from({ length: 30 }, () => +(18 + Math.random() * 8).toFixed(1)),
          lineStyle: { color: '#00E676', width: 2 },
          symbol: 'none', smooth: true,
        },
      ],
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['饲料成本', '能耗成本', '人工成本', '利润率'],
        textStyle: { color: '#8B909A', fontSize: 10 },
        bottom: 0,
      },
    })
    charts.push(chart)
  }

  // 能耗分布
  if (energyChartRef.value) {
    const chart = echarts.init(energyChartRef.value, 'dark')
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['50%', '75%'], center: ['50%', '50%'],
        itemStyle: { borderRadius: 4, borderColor: '#0A0A0B', borderWidth: 3 },
        label: { color: '#8B909A', fontSize: 10 },
        data: [
          { value: 42, name: '增氧设备', itemStyle: { color: '#00F2FF' } },
          { value: 25, name: '循环水泵', itemStyle: { color: '#448AFF' } },
          { value: 18, name: '投喂系统', itemStyle: { color: '#7C4DFF' } },
          { value: 15, name: '其他设备', itemStyle: { color: '#1a2a3a' } },
        ],
      }],
    })
    charts.push(chart)
  }

  // 成本构成饼图
  if (pieChartRef.value) {
    const chart = echarts.init(pieChartRef.value, 'dark')
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['45%', '70%'], center: ['50%', '55%'],
        itemStyle: { borderRadius: 3, borderColor: '#0A0A0B', borderWidth: 2 },
        label: { color: '#8B909A', fontSize: 10, formatter: '{b}\n{d}%' },
        data: [
          { value: 45, name: '饲料', itemStyle: { color: '#FF8C00' } },
          { value: 22, name: '电力', itemStyle: { color: '#FFD600' } },
          { value: 15, name: '人工', itemStyle: { color: '#00E676' } },
          { value: 10, name: '鱼药', itemStyle: { color: '#00F2FF' } },
          { value: 8, name: '维护', itemStyle: { color: '#7C4DFF' } },
        ],
      }],
    })
    charts.push(chart)
  }
})

onUnmounted(() => charts.forEach(c => c.dispose()))

const poolData = ref([
  { id: 'P01', base: 'A基地', breed: '石斑鱼', count: '12,000', do: 5.8, fcr: 1.28, risk: 'green', riskText: '正常', estimatedLoss: '0' },
  { id: 'P02', base: 'A基地', breed: '石斑鱼', count: '10,500', do: 5.2, fcr: 1.35, risk: 'yellow', riskText: '预警', estimatedLoss: '3.2万' },
  { id: 'P03', base: 'A基地', breed: '珍珠龙胆', count: '8,000', do: 6.1, fcr: 1.22, risk: 'green', riskText: '正常', estimatedLoss: '0' },
  { id: 'P04', base: 'B基地', breed: '东星斑', count: '15,000', do: 4.8, fcr: 1.42, risk: 'red', riskText: '告警', estimatedLoss: '18.5万' },
  { id: 'P05', base: 'B基地', breed: '老虎斑', count: '9,200', do: 5.5, fcr: 1.31, risk: 'green', riskText: '正常', estimatedLoss: '0' },
])
</script>

<style scoped>
.ceo-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 10px;
  overflow-y: auto;
}
.kpi-row { display: flex; gap: 10px; }
.kpi-card {
  flex: 1; background: var(--bg-panel); border: 1px solid var(--border-color);
  border-radius: 6px; padding: 16px; text-align: center;
}
.kpi-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 6px; }
.kpi-value { font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--text-primary); }
.kpi-unit { font-size: 14px; color: var(--text-secondary); font-weight: 400; margin-left: 2px; }
.kpi-sub { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.kpi-sub.green { color: var(--accent-green); }
.ceo-charts { display: flex; gap: 10px; flex: 1; min-height: 0; }
.chart-box { flex: 1; }
.chart-lg { width: 100%; height: 280px; }
.ceo-bottom { display: flex; gap: 10px; min-height: 200px; }
.table-box { flex: 2; overflow-y: auto; }
.pie-box { flex: 1; }

.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.data-table th {
  text-align: left; padding: 8px 10px; color: var(--text-dim); font-weight: 600;
  border-bottom: 1px solid var(--border-color); font-size: 10px; text-transform: uppercase;
}
.data-table td {
  padding: 8px 10px; border-bottom: 1px solid rgba(30,34,41,0.5); color: var(--text-secondary);
}
.pool-id { color: var(--accent-blue); font-family: var(--font-mono); font-weight: 600; }
.text-ok { color: var(--accent-green); }
.text-warn { color: var(--accent-orange); }
.text-mono { font-family: var(--font-mono); font-size: 11px; }
</style>

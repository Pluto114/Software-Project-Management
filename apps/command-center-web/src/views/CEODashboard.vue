<template>
  <div class="ceo-layout">
    <!-- 顶部 KPI 指标卡 -->
    <div class="kpi-row">
      <div class="kpi-card" v-for="kpi in kpiData" :key="kpi.label">
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-value">{{ kpi.value }}<span class="kpi-unit">{{ kpi.unit }}</span></div>
        <div class="kpi-sub" :class="kpi.trendClass">
          <span class="kpi-arrow">{{ kpi.trendArrow }}</span>
          {{ kpi.trend }}
        </div>
      </div>
    </div>

    <!-- 筛选工具栏 -->
    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">基地</span>
        <button
          v-for="b in baseFilters"
          :key="b"
          class="filter-btn"
          :class="{ active: activeBaseFilter === b }"
          @click="activeBaseFilter = b"
        >{{ b === 'all' ? '全部' : b }}</button>
      </div>
      <div class="filter-divider"></div>
      <div class="filter-group">
        <span class="filter-label">风险</span>
        <button
          v-for="r in riskFilters"
          :key="r.value"
          class="filter-btn"
          :class="{ active: activeRiskFilter === r.value }"
          @click="activeRiskFilter = r.value"
        >{{ r.label }}</button>
      </div>
      <div class="filter-divider"></div>
      <div class="filter-group">
        <span class="filter-label">品种</span>
        <button
          v-for="b in breedFilters"
          :key="b"
          class="filter-btn"
          :class="{ active: activeBreedFilter === b }"
          @click="activeBreedFilter = b"
        >{{ b === 'all' ? '全部' : b }}</button>
      </div>
      <div class="filter-spacer"></div>
      <button class="export-btn" @click="exportData">
        <span>⤓</span> 导出报表
      </button>
    </div>

    <!-- 主图表区 -->
    <div class="ceo-charts">
      <div class="panel chart-box">
        <div class="panel-header">
          <span class="panel-title">成本-收益趋势（近 30 天）</span>
          <div class="chart-legend-inline">
            <span class="legend-dot-inline" style="background:#00d4ff"></span> 饲料
            <span class="legend-dot-inline" style="background:#1a5a6a"></span> 能耗
            <span class="legend-dot-inline" style="background:#0d3038"></span> 人工
            <span class="legend-dot-inline" style="background:#00e676; width:14px; height:2px; border-radius:1px;"></span> 利润率
          </div>
        </div>
        <div ref="profitChartRef" class="chart-lg"></div>
      </div>
      <div class="panel chart-box">
        <div class="panel-header">
          <span class="panel-title">多基地能耗对比</span>
        </div>
        <div ref="baseCompareChartRef" class="chart-lg"></div>
      </div>
    </div>

    <!-- 底部表格 + 饼图 -->
    <div class="ceo-bottom">
      <div class="panel table-box">
        <div class="panel-header">
          <span class="panel-title">养殖池资产总览</span>
          <span class="table-count">{{ filteredPoolData.length }} 个池</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>池号</th><th>基地</th><th>鱼种</th><th>存池量</th><th>DO</th><th>FCR</th><th>风险</th><th>估损</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredPoolData" :key="row.id" :class="'row-' + row.risk">
              <td class="pool-id">{{ row.id }}</td>
              <td>{{ row.base }}</td>
              <td>{{ row.breed }}</td>
              <td class="text-mono">{{ row.count }}尾</td>
              <td>
                <span :class="row.do < 5 ? 'text-warn' : row.do < 5.5 ? 'text-caution' : 'text-ok'">
                  {{ row.do }} mg/L
                </span>
              </td>
              <td class="text-mono">
                {{ row.fcr }}
                <span class="fcr-arrow" :class="row.fcrTrend">
                  {{ row.fcrTrend === 'up' ? '↑' : row.fcrTrend === 'down' ? '↓' : '→' }}
                </span>
              </td>
              <td><span class="status-dot" :class="row.risk"></span> {{ row.riskText }}</td>
              <td class="text-mono">{{ row.estimatedLoss }}</td>
              <td>
                <button class="action-btn" @click="viewPoolDetail(row.id)">详情</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="panel pie-box">
        <div class="panel-header">
          <span class="panel-title">成本构成分析</span>
        </div>
        <div ref="pieChartRef" class="chart-md"></div>
        <div class="pie-legend">
          <span v-for="item in pieData" :key="item.name" class="pie-legend-item">
            <span class="pie-dot" :style="{ background: item.color }"></span>
            {{ item.name }} {{ item.pct }}%
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const profitChartRef = ref<HTMLDivElement>()
const baseCompareChartRef = ref<HTMLDivElement>()
const pieChartRef = ref<HTMLDivElement>()
let charts: echarts.ECharts[] = []

// ---- 筛选状态 ----
const activeBaseFilter = ref('all')
const activeRiskFilter = ref('all')
const activeBreedFilter = ref('all')
const baseFilters = ['all', 'A基地', 'B基地']
const riskFilters = [
  { value: 'all', label: '全部' },
  { value: 'green', label: '正常' },
  { value: 'yellow', label: '预警' },
  { value: 'red', label: '告警' },
]
const breedFilters = ['all', '石斑鱼', '珍珠龙胆', '东星斑', '老虎斑']

// ---- KPI 数据 ----
const kpiData = ref([
  { label: '总养殖池数', value: '8', unit: '池', trend: '全部在线', trendClass: '', trendArrow: '' },
  { label: '存池鱼群总值', value: '486', unit: '万元', trend: '同比 +12.3%', trendClass: 'green', trendArrow: '▲' },
  { label: '本月 FCR', value: '1.32', unit: '', trend: '优于目标 8%', trendClass: 'green', trendArrow: '▼' },
  { label: '本月能耗', value: '8,420', unit: 'kWh', trend: '较上月 -5.6%', trendClass: 'green', trendArrow: '▼' },
  { label: 'AI 预警处置率', value: '98.5', unit: '%', trend: '1 条待处理', trendClass: 'green', trendArrow: '▲' },
])

// ---- 池数据 ----
interface PoolRow {
  id: string; base: string; breed: string; count: string; do: number
  fcr: number; fcrTrend: 'up' | 'down' | 'stable'; risk: string; riskText: string; estimatedLoss: string
}

const poolData = ref<PoolRow[]>([
  { id: 'P01', base: 'A基地', breed: '石斑鱼', count: '12,000', do: 5.8, fcr: 1.28, fcrTrend: 'stable', risk: 'green', riskText: '正常', estimatedLoss: '0' },
  { id: 'P02', base: 'A基地', breed: '石斑鱼', count: '10,500', do: 5.2, fcr: 1.35, fcrTrend: 'up', risk: 'yellow', riskText: '预警', estimatedLoss: '3.2万' },
  { id: 'P03', base: 'A基地', breed: '珍珠龙胆', count: '8,000', do: 6.1, fcr: 1.22, fcrTrend: 'down', risk: 'green', riskText: '正常', estimatedLoss: '0' },
  { id: 'P04', base: 'B基地', breed: '东星斑', count: '15,000', do: 4.8, fcr: 1.42, fcrTrend: 'up', risk: 'red', riskText: '告警', estimatedLoss: '18.5万' },
  { id: 'P05', base: 'B基地', breed: '老虎斑', count: '9,200', do: 5.5, fcr: 1.31, fcrTrend: 'down', risk: 'green', riskText: '正常', estimatedLoss: '0' },
  { id: 'P06', base: 'A基地', breed: '东星斑', count: '7,500', do: 5.6, fcr: 1.25, fcrTrend: 'down', risk: 'green', riskText: '正常', estimatedLoss: '0' },
  { id: 'P07', base: 'B基地', breed: '石斑鱼', count: '11,000', do: 5.1, fcr: 1.38, fcrTrend: 'up', risk: 'yellow', riskText: '预警', estimatedLoss: '5.1万' },
  { id: 'P08', base: 'B基地', breed: '珍珠龙胆', count: '6,200', do: 5.9, fcr: 1.19, fcrTrend: 'down', risk: 'green', riskText: '正常', estimatedLoss: '0' },
])

const filteredPoolData = computed(() => {
  return poolData.value.filter(row => {
    if (activeBaseFilter.value !== 'all' && row.base !== activeBaseFilter.value) return false
    if (activeRiskFilter.value !== 'all' && row.risk !== activeRiskFilter.value) return false
    if (activeBreedFilter.value !== 'all' && row.breed !== activeBreedFilter.value) return false
    return true
  })
})

function viewPoolDetail(id: string) {
  // 跳转到详情页
}

function exportData() {
  const rows = filteredPoolData.value
  const BOM = '﻿'
  const csv = ['池号,基地,鱼种,存池量,DO(mg/L),FCR,风险,估损']
  rows.forEach(r => csv.push([r.id, r.base, r.breed, r.count, r.do, r.fcr, r.riskText, r.estimatedLoss].join(',')))
  const blob = new Blob([BOM + csv.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `养殖池资产报表_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ---- 饼图数据 ----
const pieData = [
  { name: '饲料', value: 45, pct: 45, color: '#ff6b35' },
  { name: '电力', value: 22, pct: 22, color: '#ffc107' },
  { name: '人工', value: 15, pct: 15, color: '#00e676' },
  { name: '鱼药', value: 10, pct: 10, color: '#00d4ff' },
  { name: '维护', value: 8, pct: 8, color: '#7C4DFF' },
]

// ---- 图表初始化 ----
onMounted(() => {
  // 成本-收益趋势（双Y轴）
  if (profitChartRef.value) {
    const chart = echarts.init(profitChartRef.value, 'dark')
    const days = Array.from({ length: 30 }, (_, i) => `${i + 1}日`)
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 55, right: 55, top: 15, bottom: 35 },
      xAxis: {
        type: 'category', data: days,
        axisLabel: { color: '#555a6e', fontSize: 9 },
        axisLine: { lineStyle: { color: '#2A3040' } },
      },
      yAxis: [
        {
          type: 'value', name: '万元',
          axisLabel: { color: '#555a6e', fontSize: 9 },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
        },
        {
          type: 'value', name: '%',
          axisLabel: { color: '#555a6e', fontSize: 9 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '饲料成本', type: 'bar', stack: 'cost',
          data: Array.from({ length: 30 }, () => +(2 + Math.random()).toFixed(1)),
          itemStyle: { color: '#00d4ff', borderRadius: [0, 0, 0, 0] },
          barWidth: '60%',
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
          lineStyle: { color: '#00e676', width: 2.5 },
          itemStyle: { color: '#00e676' },
          symbol: 'circle', symbolSize: 4,
          smooth: true,
        },
      ],
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['饲料成本', '能耗成本', '人工成本', '利润率'],
        textStyle: { color: '#8b92a8', fontSize: 10 },
        bottom: 0,
      },
    })
    charts.push(chart)
  }

  // 多基地对比
  if (baseCompareChartRef.value) {
    const chart = echarts.init(baseCompareChartRef.value, 'dark')
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 50, right: 30, top: 15, bottom: 35 },
      xAxis: {
        type: 'category',
        data: ['饲料', '电力', '人工', '鱼药', '维护'],
        axisLabel: { color: '#8b92a8', fontSize: 10 },
        axisLine: { lineStyle: { color: '#2A3040' } },
      },
      yAxis: {
        type: 'value', name: '万元',
        axisLabel: { color: '#555a6e', fontSize: 9 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      },
      series: [
        {
          name: 'A基地', type: 'bar',
          data: [28, 14, 10, 6, 5],
          itemStyle: { color: '#00d4ff', borderRadius: [4, 4, 0, 0] },
          barWidth: '35%', barGap: '20%',
        },
        {
          name: 'B基地', type: 'bar',
          data: [22, 11, 8, 5, 4],
          itemStyle: { color: '#ff6b35', borderRadius: [4, 4, 0, 0] },
        },
      ],
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['A基地', 'B基地'],
        textStyle: { color: '#8b92a8', fontSize: 10 },
        bottom: 0,
      },
    })
    charts.push(chart)
  }

  // 成本构成饼图
  if (pieChartRef.value) {
    const chart = echarts.init(pieChartRef.value, 'dark')
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c}万元 ({d}%)' },
      series: [{
        type: 'pie', radius: ['45%', '70%'], center: ['50%', '50%'],
        itemStyle: { borderRadius: 3, borderColor: '#0a0e17', borderWidth: 2 },
        label: { color: '#8b92a8', fontSize: 10, formatter: '{b}\n{d}%' },
        data: pieData.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } })),
      }],
    })
    charts.push(chart)
  }
})

onUnmounted(() => charts.forEach(c => c.dispose()))
</script>

<style scoped>
.ceo-layout {
  flex: 1; display: flex; flex-direction: column;
  padding: 10px; gap: 10px; overflow-y: auto;
}

/* KPI 卡片 */
.kpi-row { display: flex; gap: 10px; flex-shrink: 0; }
.kpi-card {
  flex: 1; background: var(--bg-panel); border: 1px solid var(--border-color);
  border-radius: 10px; padding: 16px; text-align: center;
  transition: border-color 0.2s;
}
.kpi-card:hover { border-color: rgba(0,212,255,0.15); }
.kpi-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.05em; }
.kpi-value { font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--text-primary); }
.kpi-unit { font-size: 14px; color: var(--text-secondary); font-weight: 400; margin-left: 2px; }
.kpi-sub { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.kpi-sub.green { color: var(--accent-green); }
.kpi-arrow { font-size: 10px; }

/* 筛选工具栏 */
.filter-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; background: rgba(255,255,255,0.02);
  border: 1px solid var(--border-color); border-radius: 8px;
  flex-shrink: 0; flex-wrap: wrap;
}
.filter-group { display: flex; align-items: center; gap: 4px; }
.filter-label { font-size: 10px; color: var(--text-dim); margin-right: 2px; }
.filter-divider { width: 1px; height: 18px; background: var(--border-color); margin: 0 4px; }
.filter-spacer { flex: 1; }
.filter-btn {
  padding: 3px 10px; border: 1px solid var(--border-color); border-radius: 5px;
  background: transparent; color: var(--text-dim); font-size: 11px;
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.filter-btn:hover { border-color: var(--accent-blue); color: var(--text-primary); }
.filter-btn.active { border-color: var(--accent-blue); color: var(--accent-blue); background: rgba(0,212,255,0.08); }
.export-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 14px; border: 1px solid var(--accent-green);
  border-radius: 6px; background: transparent; color: var(--accent-green);
  font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.2s;
}
.export-btn:hover { background: rgba(0,230,118,0.1); box-shadow: 0 0 12px rgba(0,230,118,0.15); }

/* 图表区 */
.ceo-charts { display: flex; gap: 10px; flex-shrink: 0; }
.chart-box { flex: 1; min-width: 0; }
.chart-lg { width: 100%; height: 280px; }
.chart-legend-inline { display: flex; align-items: center; gap: 3px; font-size: 10px; color: var(--text-dim); }
.legend-dot-inline { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.ceo-bottom { display: flex; gap: 10px; flex-shrink: 0; }
.table-box { flex: 2; overflow-y: auto; max-height: 320px; }
.table-count { font-size: 10px; color: var(--text-dim); }
.pie-box { flex: 1; display: flex; flex-direction: column; min-width: 0; }

/* 表格 */
.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.data-table th {
  text-align: left; padding: 8px 10px; color: var(--text-dim); font-weight: 600;
  border-bottom: 1px solid var(--border-color); font-size: 10px; text-transform: uppercase;
  white-space: nowrap;
}
.data-table td {
  padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); color: var(--text-secondary);
}
tr.row-yellow { background: rgba(255,107,53,0.03); }
tr.row-red { background: rgba(255,23,68,0.04); }
.pool-id { color: var(--accent-blue); font-family: var(--font-mono); font-weight: 600; }
.text-ok { color: var(--accent-green); }
.text-caution { color: var(--accent-yellow); }
.text-warn { color: var(--accent-orange); }
.text-mono { font-family: var(--font-mono); font-size: 11px; }
.fcr-arrow { font-size: 10px; margin-left: 2px; }
.fcr-arrow.up { color: var(--accent-red); }
.fcr-arrow.down { color: var(--accent-green); }
.fcr-arrow.stable { color: var(--text-dim); }
.action-btn {
  padding: 2px 10px; border: 1px solid var(--border-color); border-radius: 4px;
  background: transparent; color: var(--text-dim); font-size: 10px;
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.action-btn:hover { border-color: var(--accent-blue); color: var(--accent-blue); }

/* 饼图图例 */
.pie-legend { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; justify-content: center; }
.pie-legend-item { font-size: 10px; color: var(--text-dim); display: flex; align-items: center; gap: 4px; }
.pie-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.chart-md { width: 100%; height: 220px; }
</style>

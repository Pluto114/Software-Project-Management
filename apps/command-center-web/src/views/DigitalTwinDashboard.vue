<template>
  <div class="dashboard-layout">
    <!-- 左侧面板：环境态势感知窗 -->
    <aside class="left-panel">
      <!-- 风险等级 -->
      <div class="panel risk-panel" :class="'risk-' + store.alertLevel">
        <div class="panel-header">
          <span class="panel-title">资产风险等级</span>
        </div>
        <div class="risk-status-large">
          <span class="status-dot large" :class="store.alertLevel"></span>
          <span class="risk-text" v-if="store.alertLevel === 'green'">正常运行</span>
          <span class="risk-text" v-else-if="store.alertLevel === 'yellow'">趋势预警</span>
          <span class="risk-text" v-else>紧急告警</span>
        </div>
        <div class="risk-score">健康分值 <strong>{{ currentProductionHealth }}</strong>/100</div>
      </div>

      <!-- 实时传感器仪表盘 -->
      <div class="panel sensor-panel">
        <div class="panel-header">
          <span class="panel-title">环境态势感知</span>
          <span class="panel-badge">LIVE</span>
        </div>
        <div class="sensor-grid">
          <div class="sensor-card" v-for="sensor in sensors" :key="sensor.name">
            <div class="sensor-name">{{ sensor.name }}</div>
            <div class="sensor-value">
              <span class="data-value">{{ sensor.value }}</span>
              <span class="data-unit">{{ sensor.unit }}</span>
            </div>
            <div class="sensor-bar">
              <div class="sensor-bar-fill" :style="{ width: sensor.pct + '%', background: sensor.color }"></div>
            </div>
            <div class="sensor-range">{{ sensor.min }} - {{ sensor.max }} {{ sensor.unit }}</div>
          </div>
        </div>
      </div>

      <!-- 设备状态 -->
      <div class="panel device-panel">
        <div class="panel-header">
          <span class="panel-title">设备运行状态</span>
        </div>
        <div class="device-list">
          <div class="device-item" v-for="dev in devices" :key="dev.name">
            <span class="status-dot" :class="dev.on ? 'green' : 'red'"></span>
            <span class="device-name">{{ dev.name }}</span>
            <span class="device-info">{{ dev.info }}</span>
          </div>
        </div>
      </div>

      <div class="panel pool-panel">
        <div class="panel-header">
          <span class="panel-title">后端资产池</span>
          <span class="pool-count">{{ productionPools.length }} 个</span>
        </div>
        <div v-if="productionPools.length === 0" class="pool-empty">正在读取后端资产数据</div>
        <div v-else class="pool-list">
          <div v-for="pool in productionPools" :key="pool.id" class="pool-item">
            <div>
              <strong>{{ pool.pool_code }}</strong>
              <span>{{ pool.base_name }} · {{ pool.breed }}</span>
            </div>
            <em>{{ pool.fish_count.toLocaleString() }} 尾</em>
          </div>
        </div>
      </div>
    </aside>

    <!-- 中央：3D 数字孪生 -->
    <main class="center-view">
      <ThreeScene />
      <div class="pool-label">
        <span>{{ currentProductionPool?.pool_code || 'P01' }} · {{ currentProductionPool?.breed || '养殖池' }} · 3D 数字孪生</span>
        <span class="pool-coords">{{ currentProductionPool ? currentProductionPool.fish_count.toLocaleString() + ' 尾' : '720° 自由视角' }}</span>
      </div>
    </main>

    <!-- 右侧面板：风险预演 -->
    <aside class="right-panel">
      <!-- 趋势预估 -->
      <div class="panel ai-panel">
        <div class="panel-header">
          <span class="panel-title">风险预演</span>
          <span class="panel-badge blue">趋势模型</span>
        </div>
        <div class="prediction-summary">
          <div class="prediction-header-row">
            <span class="risk-level-tag yellow">中风险</span>
            <span class="prediction-time">未来 120min</span>
          </div>
          <p class="prediction-conclusion">
            预测 20:00 左右 DO 可能接近预警线 4.5mg/L
          </p>
          <p class="prediction-suggestion">
            建议提前 30min 开启增氧设备，检查底层残饵堆积
          </p>
        </div>
        <div class="prediction-stats">
          <div class="stat-row">
            <span>近 7 日准确率</span>
            <span class="stat-value">89%</span>
          </div>
          <div class="stat-row">
            <span>当前置信度</span>
            <span class="stat-value">92%</span>
          </div>
        </div>
        <button class="btn btn-warning" style="width:100%; margin-top: 12px;">
          启动预防性增氧（+15% 频率）
        </button>
      </div>

      <!-- 风险因子 -->
      <div class="panel factors-panel">
        <div class="panel-header">
          <span class="panel-title">风险因子分析</span>
        </div>
        <div class="factor-list">
          <div class="factor-item" v-for="f in store.riskFactors" :key="f.name">
            <div class="factor-header">
              <span class="factor-name">{{ f.name }}</span>
              <span class="factor-weight">{{ f.weight }}%</span>
            </div>
            <div class="factor-bar">
              <div class="factor-bar-fill" :style="{ width: f.weight + '%' }"></div>
            </div>
            <div class="factor-desc">{{ f.description }}</div>
          </div>
        </div>
      </div>

      <!-- 告警时间轴 -->
      <div class="panel alerts-panel">
        <div class="panel-header">
          <span class="panel-title">告警处置时间轴</span>
        </div>
        <div class="alert-timeline">
          <div class="timeline-item" v-for="a in alerts" :key="a.time">
            <span class="status-dot" :class="a.level"></span>
            <span class="timeline-time">{{ a.time }}</span>
            <span class="timeline-msg">{{ a.msg }}</span>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useSensorStore } from '../stores/sensorData'
import { useAuthStore } from '../stores/auth'
import ThreeScene from '../components/ThreeScene.vue'

const store = useSensorStore()
const auth = useAuthStore()

interface ProductionPool {
  id: string
  pool_code: string
  base_name: string
  breed: string
  fish_count: number
  area_sqm: number
  status: 'active' | 'maintenance' | 'idle'
  density_per_sqm?: number
}

const productionPools = ref<ProductionPool[]>([])
const currentProductionPool = computed(() => productionPools.value[0])
const currentProductionHealth = computed(() => {
  const pool = currentProductionPool.value
  if (!pool) return 87
  if (pool.status === 'maintenance') return 55
  const density = pool.density_per_sqm ?? (pool.area_sqm > 0 ? pool.fish_count / pool.area_sqm : 0)
  return Math.max(60, Math.min(94, Math.round(94 - Math.max(0, density - 18) * 1.2)))
})

async function loadProductionPools() {
  try {
    const res = await fetch('/api/v1/production/pools', {
      headers: {
        'Content-Type': 'application/json',
        ...auth.getAuthHeaders(),
      },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    productionPools.value = data.pools || []
  } catch {
    productionPools.value = []
  }
}

onMounted(() => {
  store.startSimulation()
  loadProductionPools()
})
onUnmounted(() => store.stopSimulation())

// 模拟传感器数据
const sensors = ref([
  { name: '溶解氧 (DO)', value: '5.8', unit: 'mg/L', pct: 58, min: '0', max: '10', color: '#256f8f' },
  { name: '酸碱度 (pH)', value: '7.6', unit: 'pH', pct: 54, min: '0', max: '14', color: '#2f7d57' },
  { name: '水温 (Temp)', value: '27.2', unit: '°C', pct: 68, min: '0', max: '40', color: '#b86525' },
  { name: '氨氮 (NH₃-N)', value: '0.15', unit: 'mg/L', pct: 30, min: '0', max: '0.5', color: '#b7791f' },
  { name: '电导率', value: '2.4', unit: 'mS/cm', pct: 48, min: '0', max: '5', color: '#7b8794' },
  { name: 'ORP', value: '320', unit: 'mV', pct: 64, min: '0', max: '500', color: '#5b7c99' },
])

const devices = ref([
  { name: '增氧机 #01', on: true, info: '850 RPM · 4.2A' },
  { name: '增氧机 #02', on: true, info: '820 RPM · 3.9A' },
  { name: '投喂器 #01', on: false, info: '待机' },
  { name: '循环泵 #01', on: true, info: '正常 · 1.8A' },
])

const alerts = ref([
  { time: '18:32', level: 'yellow', msg: 'DO 呈下降趋势' },
  { time: '17:45', level: 'yellow', msg: 'pH 小时变化率异常' },
  { time: '16:10', level: 'green', msg: '增氧机 #02 例行维护完成' },
  { time: '14:20', level: 'yellow', msg: '水温超过 28°C 阈值' },
  { time: '11:05', level: 'green', msg: '系统例行巡检通过' },
])
</script>

<style scoped>
.dashboard-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
  gap: 0;
}

/* 左侧面板 */
.left-panel {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid var(--border-color);
}

/* 风险面板 */
.risk-panel { text-align: center; padding: 20px 16px; }
.risk-panel.risk-green { border-color: var(--accent-green); }
.risk-panel.risk-yellow { border-color: var(--accent-orange); animation: breathe-orange 2s ease-in-out infinite; }
.risk-panel.risk-red { border-color: var(--accent-red); animation: breathe-red 2s ease-in-out infinite; }
.risk-status-large { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 12px 0; }
.status-dot.large { width: 24px; height: 24px; }
.risk-text { font-size: 22px; font-weight: 700; }
.risk-green .risk-text { color: var(--accent-green); }
.risk-yellow .risk-text { color: var(--accent-orange); }
.risk-red .risk-text { color: var(--accent-red); }
.risk-score { font-size: 13px; color: var(--text-secondary); margin-top: 8px; }
.risk-score strong { color: var(--accent-blue); font-family: var(--font-mono); font-size: 18px; }

/* 传感器面板 */
.panel-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  padding: 2px 8px; border-radius: 3px;
}
.panel-badge { background: var(--accent-green-dim); color: var(--accent-green); border: 1px solid #b9d7c6; }
.panel-badge.blue { background: var(--accent-blue-dim); color: var(--accent-blue); border-color: #bfd6df; }

.sensor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sensor-card {
  background: var(--bg-muted);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px;
}
.sensor-name { font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
.sensor-value { margin-bottom: 6px; }
.sensor-value .data-value { font-size: 22px; }
.sensor-value .data-unit { font-size: 11px; margin-left: 2px; }
.sensor-bar {
  height: 3px;
  background: var(--border-active);
  border-radius: 2px;
  margin-bottom: 4px;
}
.sensor-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
.sensor-range { font-size: 9px; color: var(--text-dim); }

/* 设备面板 */
.device-list { display: flex; flex-direction: column; gap: 8px; }
.device-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.device-name { color: var(--text-primary); flex: 1; }
.device-info { color: var(--text-dim); font-family: var(--font-mono); font-size: 10px; }

.pool-count {
  color: var(--text-dim);
  font-size: 11px;
}

.pool-empty {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  font-size: 12px;
  background: var(--bg-muted);
  border: 1px dashed var(--border-color);
  border-radius: 6px;
}

.pool-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.pool-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 9px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #ffffff;
}

.pool-item strong,
.pool-item span,
.pool-item em {
  display: block;
}

.pool-item strong {
  color: var(--accent-blue);
  font-family: var(--font-mono);
  font-size: 13px;
}

.pool-item span,
.pool-item em {
  color: var(--text-secondary);
  font-size: 11px;
  font-style: normal;
}

.pool-item em {
  white-space: nowrap;
  font-family: var(--font-mono);
}

/* 中央 3D 视图 */
.center-view {
  flex: 1;
  position: relative;
  background: var(--bg-primary);
}
.pool-label {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--border-color);
  padding: 6px 16px;
  border-radius: 6px;
}
.pool-coords { color: var(--accent-blue); }

/* 右侧面板 */
.right-panel {
  width: 320px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 1px solid var(--border-color);
}

/* 趋势预估面板 */
.prediction-summary { margin-bottom: 12px; }
.prediction-header-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.risk-level-tag {
  font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 3px;
}
.risk-level-tag.yellow { background: var(--accent-orange-dim); color: var(--accent-orange); }
.risk-level-tag.red { background: var(--accent-red-dim); color: var(--accent-red); }
.prediction-time { font-size: 11px; color: var(--text-dim); }
.prediction-conclusion { font-size: 14px; color: var(--text-primary); font-weight: 600; margin-bottom: 6px; }
.prediction-suggestion { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
.prediction-stats { display: flex; gap: 20px; }
.stat-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); }
.stat-row:not(:last-child) { margin-bottom: 4px; }
.stat-value { color: var(--accent-blue); font-family: var(--font-mono); font-weight: 600; }

/* 风险因子 */
.factor-list { display: flex; flex-direction: column; gap: 12px; }
.factor-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
.factor-name { font-size: 12px; color: var(--text-primary); }
.factor-weight { font-size: 12px; color: var(--accent-orange); font-weight: 600; font-family: var(--font-mono); }
.factor-bar { height: 4px; background: var(--border-active); border-radius: 2px; margin-bottom: 4px; }
.factor-bar-fill { height: 100%; background: var(--accent-orange); border-radius: 2px; transition: width 0.5s; }
.factor-desc { font-size: 11px; color: var(--text-dim); line-height: 1.4; }

/* 告警时间轴 */
.alert-timeline { display: flex; flex-direction: column; gap: 6px; }
.timeline-item { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.timeline-time { color: var(--text-dim); font-family: var(--font-mono); min-width: 36px; }
.timeline-msg { color: var(--text-secondary); }
</style>

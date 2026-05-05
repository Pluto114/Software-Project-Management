<template>
  <div class="mobile-shell">
    <div class="mobile-phone">
      <!-- 状态栏 -->
      <div class="phone-statusbar">
        <span class="phone-time">{{ currentTime }}</span>
        <span class="phone-icons">
          <span class="signal-bars">▂▄▆█</span>
          5G
          <span class="battery">{{ batteryPct }}%</span>
        </span>
      </div>

      <!-- App 头部 -->
      <div class="app-header">
        <div class="app-header-left">
          <span class="app-logo">AQUA</span>
          <span class="app-title">养殖池监控</span>
        </div>
        <span class="app-badge" :class="overallLevel">{{ overallText }}</span>
      </div>

      <!-- 池切换 Tab -->
      <div class="pool-tabs">
        <button
          v-for="p in pools"
          :key="p.id"
          class="pool-tab"
          :class="{ active: activePool === p.id, [p.riskLevel]: activePool === p.id }"
          @click="activePool = p.id"
        >
          <span class="tab-dot" :class="p.riskLevel"></span>
          {{ p.id }}
        </button>
      </div>

      <!-- 健康分值卡片 -->
      <div class="health-card" :class="healthLevel">
        <div class="health-ring">
          <svg viewBox="0 0 100 100" class="health-svg">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              :stroke="healthColor"
              stroke-width="6"
              stroke-linecap="round"
              :stroke-dasharray="2 * Math.PI * 42"
              :stroke-dashoffset="2 * Math.PI * 42 * (1 - currentPool.healthScore / 100)"
              class="health-arc"
            />
          </svg>
          <div class="health-center">
            <span class="health-score" :class="{ heartbeat: healthLevel === 'critical' }">{{ currentPool.healthScore }}</span>
            <span class="health-label">健康分值</span>
          </div>
        </div>
        <div class="health-meta">
          <div class="health-stat">
            <span class="hs-label">存活率</span>
            <span class="hs-value green">{{ currentPool.survivalRate }}%</span>
          </div>
          <div class="health-stat">
            <span class="hs-label">FCR</span>
            <span class="hs-value" :class="currentPool.fcr > 1.4 ? 'warn' : ''">{{ currentPool.fcr }}</span>
          </div>
          <div class="health-stat">
            <span class="hs-label">估损</span>
            <span class="hs-value" :class="currentPool.estimatedLoss > 0 ? 'danger' : ''">{{ currentPool.estimatedLoss }}万</span>
          </div>
        </div>
      </div>

      <!-- 传感器指标卡片 -->
      <div class="section-title">实时指标</div>
      <div class="indicator-grid">
        <div class="indicator-card" v-for="s in currentPool.sensors" :key="s.key" :class="'severity-' + s.status">
          <div class="indicator-header">
            <span class="indicator-name">{{ s.label }}</span>
            <span class="severity-marker" :class="s.status">
              {{ s.status === 'danger' ? '◆' : s.status === 'warning' ? '▲' : '●' }}
            </span>
          </div>
          <div class="indicator-body">
            <span class="indicator-value" :class="s.status">{{ s.displayValue }}</span>
            <span class="indicator-unit">{{ s.unit }}</span>
          </div>
          <div class="indicator-bar-track">
            <div class="indicator-bar-fill" :style="{ width: s.pct + '%', background: s.barColor }"></div>
          </div>
          <div class="indicator-range">
            <span :class="s.status === 'danger' ? 'text-danger' : ''">阈值: {{ s.thresholdText }}</span>
          </div>
        </div>
      </div>

      <!-- 设备状态 -->
      <div class="section-title">设备运行</div>
      <div class="device-grid">
        <div class="device-card" v-for="d in devices" :key="d.name" :class="{ on: d.on }">
          <div class="device-icon" :class="{ on: d.on }" @click="toggleDevice(d)">
            <span class="device-power">{{ d.on ? '◉' : '○' }}</span>
          </div>
          <div class="device-info">
            <span class="device-name">{{ d.name }}</span>
            <span class="device-detail">{{ d.info }}</span>
          </div>
          <label class="device-switch" @click.stop>
            <input type="checkbox" v-model="d.on" @change="() => {}" />
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>

      <!-- 滑动解锁应急控制 -->
      <div class="section-title">
        应急控制
        <span v-if="unlocked" class="countdown-badge">{{ countdown }}s</span>
      </div>
      <div class="emergency-panel" :class="{ unlocked: unlocked, confirming: confirming }">
        <div
          ref="slideTrackRef"
          class="slide-track"
          @mousedown="onSlideStart"
          @touchstart.passive="onSlideStart"
        >
          <div class="slide-fill" :style="{ width: slidePct + '%' }"></div>
          <div class="slide-bg-text" v-if="!unlocked">滑动解锁应急操作</div>
          <div
            class="slide-thumb"
            :class="{ sliding: isSliding }"
            :style="{ left: slidePct + '%' }"
          >
            <span class="slide-icon">{{ unlocked ? '✓' : '⟫' }}</span>
          </div>
        </div>
        <div class="emergency-actions" v-if="unlocked">
          <button class="emergency-btn critical" @click="triggerEmergency('full_aeration')">
            <span class="eb-icon">⚡</span> 全负荷增氧
          </button>
          <button class="emergency-btn warning" @click="triggerEmergency('freq_up')">
            <span class="eb-icon">↑</span> 增氧频率 +15%
          </button>
          <button class="emergency-btn info" @click="triggerEmergency('stop_feed')">
            <span class="eb-icon">⏸</span> 停止投喂
          </button>
        </div>
      </div>

      <!-- 最近告警 -->
      <div class="section-title">告警记录</div>
      <div class="alert-list">
        <div class="alert-row" v-for="a in alerts" :key="a.time" :class="'severity-' + a.level">
          <span class="severity-marker small" :class="a.level">
            {{ a.level === 'danger' ? '◆' : a.level === 'warning' ? '▲' : '●' }}
          </span>
          <span class="alert-time">{{ a.time }}</span>
          <span class="alert-msg">{{ a.msg }}</span>
        </div>
      </div>

      <!-- 底部安全区 -->
      <div class="phone-bottom">
        <span class="bottom-hint">AquaIntelligence Technician v1.0 · {{ currentTime }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useNotification } from '../composables/useNotification'

// ---- 传感器阈值定义 ----
const THRESHOLDS: Record<string, { green: [number, number]; yellow: [number, number]; unit: string; label: string }> = {
  DO: { green: [5.5, 9], yellow: [4.5, 5.5], unit: 'mg/L', label: 'DO' },
  TEMP: { green: [22, 28], yellow: [28, 30], unit: '°C', label: '水温' },
  pH: { green: [7.0, 8.0], yellow: [6.5, 8.5], unit: 'pH', label: 'pH' },
  NH3N: { green: [0, 0.2], yellow: [0.2, 0.3], unit: 'mg/L', label: '氨氮' },
}

function evaluateSeverity(key: string, value: number): 'normal' | 'warning' | 'danger' {
  const t = THRESHOLDS[key]
  if (!t) return 'normal'
  if (value >= t.green[0] && value <= t.green[1]) return 'normal'
  if (value >= t.yellow[0] && value <= t.yellow[1]) return 'warning'
  return 'danger'
}

function getBarPct(key: string, value: number): number {
  switch (key) {
    case 'DO': return Math.min(100, (value / 9) * 100)
    case 'TEMP': return Math.min(100, ((value - 20) / 15) * 100)
    case 'pH': return Math.min(100, ((value - 6.5) / 2) * 100)
    case 'NH3N': return Math.min(100, (value / 0.5) * 100)
    default: return 50
  }
}

function getBarColor(key: string, status: string): string {
  if (status === 'danger') return '#ff1744'
  if (status === 'warning') return '#ff6b35'
  return '#00e676'
}

function getThresholdText(key: string): string {
  const t = THRESHOLDS[key]
  return `${t.green[0]}-${t.green[1]} ${t.unit}`
}

// ---- 数据 ----
interface SensorInfo {
  key: string
  label: string
  value: number
  displayValue: string
  unit: string
  status: 'normal' | 'warning' | 'danger'
  pct: number
  barColor: string
  thresholdText: string
}

interface PoolData {
  id: string
  base: string
  breed: string
  survivalRate: number
  fcr: number
  estimatedLoss: number
  healthScore: number
  riskLevel: 'green' | 'yellow' | 'red'
  sensors: SensorInfo[]
}

function makePoolSensor(key: string, value: number): SensorInfo {
  const status = evaluateSeverity(key, value)
  return {
    key,
    label: THRESHOLDS[key]?.label || key,
    value,
    displayValue: value.toFixed(key === 'pH' ? 1 : 2),
    unit: THRESHOLDS[key]?.unit || '',
    status,
    pct: getBarPct(key, value),
    barColor: getBarColor(key, status),
    thresholdText: getThresholdText(key),
  }
}

const pools = ref<PoolData[]>([
  {
    id: 'P01', base: 'A基地', breed: '石斑鱼', survivalRate: 94, fcr: 1.28, estimatedLoss: 0, healthScore: 87, riskLevel: 'green',
    sensors: [
      makePoolSensor('DO', 5.8),
      makePoolSensor('pH', 7.6),
      makePoolSensor('TEMP', 27.2),
      makePoolSensor('NH3N', 0.15),
    ],
  },
  {
    id: 'P02', base: 'A基地', breed: '石斑鱼', survivalRate: 88, fcr: 1.35, estimatedLoss: 3.2, healthScore: 68, riskLevel: 'yellow',
    sensors: [
      makePoolSensor('DO', 5.2),
      makePoolSensor('pH', 7.4),
      makePoolSensor('TEMP', 27.8),
      makePoolSensor('NH3N', 0.18),
    ],
  },
  {
    id: 'P04', base: 'B基地', breed: '东星斑', survivalRate: 72, fcr: 1.42, estimatedLoss: 18.5, healthScore: 41, riskLevel: 'red',
    sensors: [
      makePoolSensor('DO', 4.8),
      makePoolSensor('pH', 7.2),
      makePoolSensor('TEMP', 28.4),
      makePoolSensor('NH3N', 0.25),
    ],
  },
  {
    id: 'P03', base: 'A基地', breed: '珍珠龙胆', survivalRate: 97, fcr: 1.22, estimatedLoss: 0, healthScore: 92, riskLevel: 'green',
    sensors: [
      makePoolSensor('DO', 6.1),
      makePoolSensor('pH', 7.8),
      makePoolSensor('TEMP', 26.8),
      makePoolSensor('NH3N', 0.12),
    ],
  },
  {
    id: 'P05', base: 'B基地', breed: '老虎斑', survivalRate: 91, fcr: 1.31, estimatedLoss: 0, healthScore: 85, riskLevel: 'green',
    sensors: [
      makePoolSensor('DO', 5.5),
      makePoolSensor('pH', 7.5),
      makePoolSensor('TEMP', 27.0),
      makePoolSensor('NH3N', 0.16),
    ],
  },
])

interface DeviceItem {
  name: string
  on: boolean
  info: string
  baseInfo: string
}

const devices = ref<DeviceItem[]>([
  { name: '增氧机 #01', on: true, info: '850 RPM · 4.2A', baseInfo: '850 RPM · 4.2A' },
  { name: '增氧机 #02', on: true, info: '820 RPM · 3.9A', baseInfo: '820 RPM · 3.9A' },
  { name: '投喂器 #01', on: false, info: '待机', baseInfo: '待机' },
  { name: '循环泵 #01', on: true, info: '正常 · 1.8A', baseInfo: '正常 · 1.8A' },
])

function toggleDevice(d: DeviceItem) {
  d.on = !d.on
  d.info = d.on ? d.baseInfo : '已关闭'
}

const alerts = ref([
  { time: '18:32', level: 'warning' as const, msg: 'AI 预测 DO 呈下降趋势' },
  { time: '17:45', level: 'warning' as const, msg: 'pH 小时变化率异常' },
  { time: '16:10', level: 'normal' as const, msg: '#02 增氧机维护完成' },
  { time: '14:20', level: 'danger' as const, msg: 'P04 水温超 28°C 阈值' },
  { time: '11:05', level: 'normal' as const, msg: '系统例行巡检通过' },
])

// ---- 时间/电量 ----
const currentTime = ref('')
const batteryPct = ref(88)
let timeTimer: number | null = null

function updateTime() {
  const now = new Date()
  currentTime.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

// ---- 交互 ----
const activePool = ref('P01')
const currentPool = computed(() => pools.value.find(p => p.id === activePool.value) || pools.value[0])

const healthLevel = computed(() => {
  const s = currentPool.value.healthScore
  if (s < 50) return 'critical'
  if (s < 75) return 'warning'
  return 'normal'
})

const healthColor = computed(() => {
  if (healthLevel.value === 'critical') return '#ff1744'
  if (healthLevel.value === 'warning') return '#ff6b35'
  return '#00e676'
})

const overallLevel = computed(() => {
  const reds = pools.value.filter(p => p.riskLevel === 'red').length
  if (reds > 0) return 'red'
  const yellows = pools.value.filter(p => p.riskLevel === 'yellow').length
  if (yellows > 0) return 'yellow'
  return 'green'
})

const overallText = computed(() => {
  if (overallLevel.value === 'red') return '紧急'
  if (overallLevel.value === 'yellow') return '关注'
  return '正常'
})

// ---- 滑动解锁 + 倒计时 ----
const slideTrackRef = ref<HTMLDivElement>()
const unlocked = ref(false)
const confirming = ref(false)
const isSliding = ref(false)
const slidePct = ref(0)
const countdown = ref(30)
const SLIDE_THRESHOLD = 75
let countdownTimer: number | null = null

function startCountdown() {
  countdown.value = 30
  countdownTimer = window.setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      unlocked.value = false
      slidePct.value = 0
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

function calcSlidePct(clientX: number): number {
  if (!slideTrackRef.value) return 0
  const rect = slideTrackRef.value.getBoundingClientRect()
  return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
}

function onSlideStart(e: MouseEvent | TouchEvent) {
  if (unlocked.value) return
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  isSliding.value = true
  slidePct.value = calcSlidePct(clientX)
  window.addEventListener('mousemove', onSlideMove)
  window.addEventListener('mouseup', onSlideEnd)
  window.addEventListener('touchmove', onSlideMove, { passive: false })
  window.addEventListener('touchend', onSlideEnd)
}

function onSlideMove(e: MouseEvent | TouchEvent) {
  if (!isSliding.value) return
  const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX
  slidePct.value = calcSlidePct(clientX)
}

function onSlideEnd() {
  if (!isSliding.value) return
  isSliding.value = false
  if (slidePct.value >= SLIDE_THRESHOLD) {
    unlocked.value = true
    slidePct.value = 100
    startCountdown()
  } else {
    slidePct.value = 0
  }
  window.removeEventListener('mousemove', onSlideMove)
  window.removeEventListener('mouseup', onSlideEnd)
  window.removeEventListener('touchmove', onSlideMove)
  window.removeEventListener('touchend', onSlideEnd)
}

const { notify, ensurePermission } = useNotification()

function triggerEmergency(action: string) {
  confirming.value = true
  const msgs: Record<string, string> = {
    full_aeration: '全负荷增氧指令已发送',
    freq_up: '增氧频率 +15% 指令已发送',
    stop_feed: '停止投喂指令已发送',
  }
  const msg = msgs[action] || action
  const alert = { time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), level: 'danger' as const, msg }
  alerts.value.unshift(alert)
  notify('应急指令已执行', `${currentPool.value.id}: ${msg}`, 'red')
  setTimeout(() => {
    confirming.value = false
    unlocked.value = false
    slidePct.value = 0
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = null
  }, 2000)
}

// ---- 生命周期 ----
onMounted(() => {
  updateTime()
  timeTimer = window.setInterval(updateTime, 10000)
  ensurePermission()
})

onUnmounted(() => {
  if (timeTimer) clearInterval(timeTimer)
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<style scoped>
/* 手机壳 */
.mobile-shell {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 10px;
  overflow-y: auto;
  background: var(--bg-primary);
}

.mobile-phone {
  width: 100%;
  max-width: 420px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0,212,255,0.05);
}

/* 状态栏 */
.phone-statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  background: var(--bg-primary);
}
.signal-bars { letter-spacing: 1px; color: var(--text-secondary); }
.battery { margin-left: 4px; color: var(--accent-green); }

/* App 头 */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}
.app-header-left { display: flex; align-items: center; gap: 10px; }
.app-logo {
  font-weight: 800; font-size: 14px; letter-spacing: 0.15em;
  color: var(--accent-blue);
}
.app-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.app-badge {
  font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 10px;
}
.app-badge.green { background: var(--accent-green-dim); color: var(--accent-green); }
.app-badge.yellow { background: var(--accent-orange-dim); color: var(--accent-orange); }
.app-badge.red { background: rgba(255,23,68,0.15); color: var(--accent-red); }

/* 池 Tab */
.pool-tabs {
  display: flex; gap: 0; padding: 6px 12px;
  background: var(--bg-primary); overflow-x: auto;
}
.pool-tab {
  flex: 1; padding: 6px 0; border: none;
  background: transparent; color: var(--text-dim);
  font-family: var(--font-mono); font-size: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  border-bottom: 2px solid transparent; transition: all 0.2s;
}
.pool-tab.active { color: var(--text-primary); border-bottom-color: var(--accent-blue); }
.pool-tab.active.yellow { border-bottom-color: var(--accent-orange); color: var(--accent-orange); }
.pool-tab.active.red { border-bottom-color: var(--accent-red); color: var(--accent-red); }
.tab-dot { width: 6px; height: 6px; border-radius: 50%; }
.tab-dot.green { background: var(--accent-green); }
.tab-dot.yellow { background: var(--accent-orange); }
.tab-dot.red { background: var(--accent-red); }

/* 健康分值卡片 */
.health-card {
  margin: 10px 12px; padding: 16px; border-radius: 14px;
  background: var(--bg-panel); border: 1px solid var(--border-color);
  display: flex; align-items: center; gap: 20px;
  transition: border-color 0.3s;
}
.health-card.warning { border-color: var(--accent-orange); }
.health-card.critical { border-color: var(--accent-red); animation: breathe-red 2s ease-in-out infinite; }
.health-ring { position: relative; width: 90px; height: 90px; flex-shrink: 0; }
.health-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.health-arc { transition: stroke-dashoffset 0.6s ease, stroke 0.3s; }
.health-center {
  position: absolute; inset: 0; display: flex;
  flex-direction: column; align-items: center; justify-content: center;
}
.health-score {
  font-family: var(--font-mono); font-size: 28px; font-weight: 700;
  color: var(--text-primary); line-height: 1;
}
.health-score.heartbeat { animation: heartbeat 1s ease-in-out infinite; }
.health-label { font-size: 9px; color: var(--text-dim); text-transform: uppercase; margin-top: 2px; }
.health-meta { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.health-stat { display: flex; justify-content: space-between; align-items: center; }
.hs-label { font-size: 11px; color: var(--text-dim); }
.hs-value { font-family: var(--font-mono); font-size: 15px; font-weight: 600; color: var(--text-primary); }
.hs-value.green { color: var(--accent-green); }
.hs-value.warn { color: var(--accent-orange); }
.hs-value.danger { color: var(--accent-red); }

/* 区域标题 */
.section-title {
  font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase;
  padding: 12px 16px 6px; letter-spacing: 0.1em;
  display: flex; align-items: center; gap: 8px;
}
.countdown-badge {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700;
  color: var(--accent-red); background: rgba(255,23,68,0.12);
  padding: 2px 8px; border-radius: 10px;
  animation: alert-blink 1s ease-in-out infinite;
}

/* 指标卡片 */
.indicator-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  padding: 0 12px;
}
.indicator-card {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 10px; padding: 12px;
  transition: border-color 0.3s;
}
.indicator-card.severity-warning { border-color: rgba(255,107,53,0.3); }
.indicator-card.severity-danger { border-color: rgba(255,23,68,0.4); animation: breathe-red 2s ease-in-out infinite; }
.indicator-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.indicator-name { font-size: 10px; color: var(--text-dim); text-transform: uppercase; }
.severity-marker { font-size: 12px; }
.severity-marker.normal { color: var(--accent-green); }
.severity-marker.warning { color: var(--accent-orange); }
.severity-marker.danger { color: var(--accent-red); }
.severity-marker.small { font-size: 10px; flex-shrink: 0; }
.indicator-body { display: flex; align-items: baseline; gap: 3px; margin-bottom: 8px; }
.indicator-value {
  font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--text-primary); line-height: 1;
}
.indicator-value.warning { color: var(--accent-orange); }
.indicator-value.danger { color: var(--accent-red); }
.indicator-unit { font-size: 10px; color: var(--text-dim); }
.indicator-bar-track {
  height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; margin-bottom: 4px; overflow: hidden;
}
.indicator-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
.indicator-range { font-size: 9px; color: var(--text-dim); }
.text-danger { color: var(--accent-red); }

/* 设备网格 */
.device-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  padding: 0 12px;
}
.device-card {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card); border-radius: 8px; padding: 10px;
  transition: background 0.2s;
}
.device-card.on { background: rgba(0,230,118,0.03); }
.device-icon { font-size: 18px; cursor: pointer; }
.device-icon .device-power { color: var(--text-dim); transition: color 0.2s; }
.device-icon.on .device-power { color: var(--accent-green); }
.device-info { flex: 1; min-width: 0; }
.device-name { font-size: 11px; color: var(--text-primary); display: block; }
.device-detail { font-size: 9px; color: var(--text-dim); font-family: var(--font-mono); }
.device-switch { position: relative; width: 40px; height: 22px; flex-shrink: 0; }
.device-switch input { opacity: 0; width: 0; height: 0; }
.switch-slider {
  position: absolute; inset: 0; cursor: pointer;
  background: rgba(255,255,255,0.1); border-radius: 22px;
  transition: background 0.2s;
}
.switch-slider::before {
  content: ''; position: absolute; height: 16px; width: 16px;
  left: 3px; bottom: 3px; background: var(--text-dim);
  border-radius: 50%; transition: transform 0.2s, background 0.2s;
}
.device-switch input:checked + .switch-slider { background: var(--accent-green-dim); }
.device-switch input:checked + .switch-slider::before {
  transform: translateX(18px); background: var(--accent-green);
}

/* 滑动解锁 */
.emergency-panel {
  margin: 0 12px 6px; padding: 12px;
  background: var(--bg-panel); border: 1px solid var(--border-color);
  border-radius: 12px; transition: border-color 0.3s;
}
.emergency-panel.unlocked { border-color: var(--accent-red); }
.emergency-panel.confirming { border-color: var(--accent-green); }

.slide-track {
  position: relative; height: 48px;
  background: var(--bg-card); border-radius: 24px;
  overflow: hidden; cursor: pointer; user-select: none;
}
.slide-bg-text {
  position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center;
  font-size: 11px; color: var(--text-dim); letter-spacing: 0.05em;
}
.slide-fill {
  position: absolute; left: 0; top: 0; height: 100%;
  background: linear-gradient(90deg, var(--accent-red), var(--accent-orange));
  border-radius: 24px 0 0 24px; transition: width 0.1s;
}
.slide-thumb {
  position: absolute; top: 4px;
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--bg-primary); border: 2px solid var(--accent-red);
  display: flex; align-items: center; justify-content: center;
  transform: translateX(-50%); transition: left 0.1s; z-index: 2;
}
.slide-thumb.sliding { border-color: var(--accent-orange); box-shadow: 0 0 8px rgba(255,107,53,0.4); }
.slide-icon { font-size: 16px; color: var(--accent-red); font-weight: 700; }

.emergency-actions { display: flex; gap: 6px; margin-top: 10px; animation: fade-in 0.3s ease; }
.emergency-btn {
  flex: 1; padding: 10px 4px; border: none; border-radius: 8px;
  font-size: 10px; font-weight: 700; cursor: pointer; color: #000;
  transition: transform 0.15s; display: flex; flex-direction: column;
  align-items: center; gap: 2px;
}
.emergency-btn:active { transform: scale(0.96); }
.emergency-btn.critical { background: var(--accent-red); color: #fff; }
.emergency-btn.warning { background: var(--accent-orange); }
.emergency-btn.info { background: var(--accent-blue); }
.eb-icon { font-size: 14px; }

/* 告警列表 */
.alert-list { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 4px; }
.alert-row { display: flex; align-items: center; gap: 8px; font-size: 11px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.alert-row.severity-danger { background: rgba(255,23,68,0.03); border-radius: 4px; padding-left: 6px; }
.alert-row.severity-warning { background: rgba(255,107,53,0.03); border-radius: 4px; padding-left: 6px; }
.alert-time { color: var(--text-dim); font-family: var(--font-mono); min-width: 36px; }
.alert-msg { color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 底部 */
.phone-bottom { padding: 12px; text-align: center; background: var(--bg-primary); border-top: 1px solid var(--border-color); }
.bottom-hint { font-size: 9px; color: var(--text-dim); }
</style>

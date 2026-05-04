<template>
  <div class="mobile-shell">
    <div class="mobile-phone">
      <!-- 状态栏 -->
      <div class="phone-statusbar">
        <span class="phone-time">9:41</span>
        <span class="phone-icons">5G ▮▮▮▮ 88%</span>
      </div>

      <!-- App 头部 -->
      <div class="app-header">
        <span class="app-logo">AQUA</span>
        <span class="app-title">养殖池监控</span>
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

      <!-- 当前池概况卡片 -->
      <div class="overview-card" :class="currentPool.riskLevel">
        <div class="overview-header">
          <span class="pool-name">{{ currentPool.id }} · {{ currentPool.breed }}</span>
          <span class="pool-base">{{ currentPool.base }}</span>
        </div>

        <!-- 红绿灯仪表盘 -->
        <div class="traffic-light">
          <div class="traffic-item" v-for="s in currentPool.sensors" :key="s.name">
            <div class="traffic-circle" :class="s.status">
              <span class="traffic-value">{{ s.value }}</span>
            </div>
            <span class="traffic-label">{{ s.name }}</span>
            <span class="traffic-unit">{{ s.unit }}</span>
          </div>
        </div>

        <!-- 存池量 + FCR -->
        <div class="overview-stats">
          <div class="stat-mini">
            <span class="stat-mini-label">存池</span>
            <span class="stat-mini-value">{{ currentPool.fishCount }}尾</span>
          </div>
          <div class="stat-mini">
            <span class="stat-mini-label">FCR</span>
            <span class="stat-mini-value">{{ currentPool.fcr }}</span>
          </div>
          <div class="stat-mini">
            <span class="stat-mini-label">估损</span>
            <span class="stat-mini-value" :class="{ 'text-warn': currentPool.estimatedLoss > 0 }">{{ currentPool.estimatedLoss }}</span>
          </div>
        </div>
      </div>

      <!-- 设备状态 -->
      <div class="section-title">设备运行</div>
      <div class="device-grid">
        <div class="device-card" v-for="d in devices" :key="d.name">
          <div class="device-icon" :class="{ on: d.on }">{{ d.on ? '◉' : '○' }}</div>
          <div class="device-info">
            <span class="device-name">{{ d.name }}</span>
            <span class="device-detail">{{ d.info }}</span>
          </div>
        </div>
      </div>

      <!-- 滑动解锁应急控制 -->
      <div class="section-title">应急控制</div>
      <div class="emergency-panel" :class="{ unlocked: unlocked, confirming: confirming }">
        <div
          ref="slideTrackRef"
          class="slide-track"
          @mousedown="onSlideStart"
          @touchstart.passive="onSlideStart"
        >
          <div class="slide-fill" :style="{ width: slidePct + '%' }"></div>
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
            全负荷增氧
          </button>
          <button class="emergency-btn warning" @click="triggerEmergency('freq_up')">
            增氧频率 +15%
          </button>
          <button class="emergency-btn info" @click="triggerEmergency('stop_feed')">
            停止投喂
          </button>
        </div>
        <p class="emergency-hint" v-if="!unlocked">← 滑动解锁应急操作</p>
      </div>

      <!-- 最近告警 -->
      <div class="section-title">告警记录</div>
      <div class="alert-list">
        <div class="alert-row" v-for="a in alerts" :key="a.time">
          <span class="alert-dot" :class="a.level"></span>
          <span class="alert-time">{{ a.time }}</span>
          <span class="alert-msg">{{ a.msg }}</span>
        </div>
      </div>

      <!-- 底部安全区 -->
      <div class="phone-bottom">
        <span class="bottom-hint">AquaIntelligence Technician v1.0</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useNotification } from '../composables/useNotification'

// ==================== 数据 ====================

interface SensorStatus {
  name: string; value: string; unit: string; status: 'green' | 'yellow' | 'red'
}

interface PoolData {
  id: string; base: string; breed: string; fishCount: string
  fcr: number; estimatedLoss: number
  riskLevel: 'green' | 'yellow' | 'red'
  sensors: SensorStatus[]
}

const pools = ref<PoolData[]>([
  {
    id: 'P01', base: 'A基地', breed: '石斑鱼', fishCount: '12,000', fcr: 1.28, estimatedLoss: 0, riskLevel: 'green',
    sensors: [
      { name: 'DO', value: '5.8', unit: 'mg/L', status: 'green' },
      { name: 'pH', value: '7.6', unit: 'pH', status: 'green' },
      { name: '水温', value: '27.2', unit: '°C', status: 'green' },
      { name: '氨氮', value: '0.15', unit: 'mg/L', status: 'green' },
    ],
  },
  {
    id: 'P02', base: 'A基地', breed: '石斑鱼', fishCount: '10,500', fcr: 1.35, estimatedLoss: 3.2, riskLevel: 'yellow',
    sensors: [
      { name: 'DO', value: '5.2', unit: 'mg/L', status: 'yellow' },
      { name: 'pH', value: '7.4', unit: 'pH', status: 'green' },
      { name: '水温', value: '27.8', unit: '°C', status: 'yellow' },
      { name: '氨氮', value: '0.18', unit: 'mg/L', status: 'green' },
    ],
  },
  {
    id: 'P04', base: 'B基地', breed: '东星斑', fishCount: '15,000', fcr: 1.42, estimatedLoss: 18.5, riskLevel: 'red',
    sensors: [
      { name: 'DO', value: '4.8', unit: 'mg/L', status: 'red' },
      { name: 'pH', value: '7.2', unit: 'pH', status: 'yellow' },
      { name: '水温', value: '28.4', unit: '°C', status: 'red' },
      { name: '氨氮', value: '0.25', unit: 'mg/L', status: 'yellow' },
    ],
  },
  {
    id: 'P03', base: 'A基地', breed: '珍珠龙胆', fishCount: '8,000', fcr: 1.22, estimatedLoss: 0, riskLevel: 'green',
    sensors: [
      { name: 'DO', value: '6.1', unit: 'mg/L', status: 'green' },
      { name: 'pH', value: '7.8', unit: 'pH', status: 'green' },
      { name: '水温', value: '26.8', unit: '°C', status: 'green' },
      { name: '氨氮', value: '0.12', unit: 'mg/L', status: 'green' },
    ],
  },
  {
    id: 'P05', base: 'B基地', breed: '老虎斑', fishCount: '9,200', fcr: 1.31, estimatedLoss: 0, riskLevel: 'green',
    sensors: [
      { name: 'DO', value: '5.5', unit: 'mg/L', status: 'green' },
      { name: 'pH', value: '7.5', unit: 'pH', status: 'green' },
      { name: '水温', value: '27.0', unit: '°C', status: 'green' },
      { name: '氨氮', value: '0.16', unit: 'mg/L', status: 'green' },
    ],
  },
])

const devices = ref([
  { name: '增氧机 #01', on: true, info: '850 RPM · 4.2A' },
  { name: '增氧机 #02', on: true, info: '820 RPM · 3.9A' },
  { name: '投喂器 #01', on: false, info: '待机' },
  { name: '循环泵 #01', on: true, info: '1.8A' },
])

const alerts = ref([
  { time: '18:32', level: 'yellow', msg: 'AI 预测 DO 呈下降趋势' },
  { time: '17:45', level: 'yellow', msg: 'pH 小时变化率异常' },
  { time: '16:10', level: 'green', msg: '#02 增氧机维护完成' },
  { time: '14:20', level: 'red', msg: 'P04 水温超 28°C 阈值' },
  { time: '11:05', level: 'green', msg: '系统例行巡检通过' },
])

// ==================== 交互 ====================

const activePool = ref('P01')
const currentPool = computed(() => pools.value.find(p => p.id === activePool.value) || pools.value[0])
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

// 滑动解锁
const slideTrackRef = ref<HTMLDivElement>()
const unlocked = ref(false)
const confirming = ref(false)
const isSliding = ref(false)
const slidePct = ref(0)
const SLIDE_THRESHOLD = 75

// 浏览器通知
const { notify, ensurePermission } = useNotification()
onMounted(() => { ensurePermission() })

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
  } else {
    slidePct.value = 0
  }
  // 移除全局监听
  window.removeEventListener('mousemove', onSlideMove)
  window.removeEventListener('mouseup', onSlideEnd)
  window.removeEventListener('touchmove', onSlideMove)
  window.removeEventListener('touchend', onSlideEnd)
}


function triggerEmergency(action: string) {
  confirming.value = true
  const msgs: Record<string, string> = {
    full_aeration: '全负荷增氧指令已发送',
    freq_up: '增氧频率 +15% 指令已发送',
    stop_feed: '停止投喂指令已发送',
  }
  const msg = msgs[action] || action
  const alert = { time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), level: 'red' as const, msg }
  alerts.value.unshift(alert)
  notify('应急指令已执行', `${currentPool.value.id}: ${msg}`, 'red')
  setTimeout(() => {
    confirming.value = false
    unlocked.value = false
    slidePct.value = 0
  }, 2000)
}
</script>

<style scoped>
/* 手机壳模拟 */
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
  box-shadow: 0 0 40px rgba(0,242,255,0.05);
}

/* 状态栏 */
.phone-statusbar {
  display: flex;
  justify-content: space-between;
  padding: 8px 20px;
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  background: var(--bg-primary);
}

/* App 头 */
.app-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}
.app-logo {
  font-weight: 800; font-size: 13px; letter-spacing: 0.15em;
  color: var(--accent-blue);
}
.app-title { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; }
.app-badge {
  font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 10px;
}
.app-badge.green { background: var(--accent-green-dim); color: var(--accent-green); }
.app-badge.yellow { background: var(--accent-orange-dim); color: var(--accent-orange); }
.app-badge.red { background: rgba(255,68,68,0.15); color: var(--accent-red); }

/* 池 Tab */
.pool-tabs {
  display: flex;
  gap: 0;
  padding: 6px 12px;
  background: var(--bg-primary);
  overflow-x: auto;
}
.pool-tab {
  flex: 1;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.pool-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-blue);
}
.pool-tab.active.yellow { border-bottom-color: var(--accent-orange); color: var(--accent-orange); }
.pool-tab.active.red { border-bottom-color: var(--accent-red); color: var(--accent-red); }
.tab-dot { width: 6px; height: 6px; border-radius: 50%; }
.tab-dot.green { background: var(--accent-green); }
.tab-dot.yellow { background: var(--accent-orange); }
.tab-dot.red { background: var(--accent-red); }

/* 概况卡片 */
.overview-card {
  margin: 10px 12px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
}
.overview-card.green { border-color: var(--accent-green-dim); }
.overview-card.yellow { border-color: var(--accent-orange); animation: breathe-orange 2s ease-in-out infinite; }
.overview-card.red { border-color: var(--accent-red); animation: breathe-red 2s ease-in-out infinite; }
.overview-header { display: flex; justify-content: space-between; margin-bottom: 12px; }
.pool-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.pool-base { font-size: 11px; color: var(--text-dim); }

/* 红绿灯仪表盘 */
.traffic-light {
  display: flex;
  justify-content: space-around;
  margin-bottom: 14px;
  gap: 8px;
}
.traffic-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.traffic-circle {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid;
}
.traffic-circle.green {
  background: rgba(0,230,118,0.12); border-color: var(--accent-green);
  box-shadow: 0 0 12px rgba(0,230,118,0.25);
}
.traffic-circle.yellow {
  background: rgba(255,140,0,0.12); border-color: var(--accent-orange);
  box-shadow: 0 0 12px rgba(255,140,0,0.25);
}
.traffic-circle.red {
  background: rgba(255,68,68,0.12); border-color: var(--accent-red);
  box-shadow: 0 0 12px rgba(255,68,68,0.25);
  animation: breathe-red 2s ease-in-out infinite;
}
.traffic-value { font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: var(--text-primary); }
.traffic-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; }
.traffic-unit { font-size: 9px; color: var(--text-dim); }

/* 统计小卡片 */
.overview-stats { display: flex; gap: 8px; }
.stat-mini {
  flex: 1; background: var(--bg-card); border-radius: 6px;
  padding: 8px; text-align: center;
}
.stat-mini-label { font-size: 9px; color: var(--text-dim); text-transform: uppercase; display: block; }
.stat-mini-value { font-size: 13px; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); }
.text-warn { color: var(--accent-red); }

/* 区域标题 */
.section-title {
  font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase;
  padding: 10px 16px 6px; letter-spacing: 0.1em;
}

/* 设备网格 */
.device-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  padding: 0 12px;
}
.device-card {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card); border-radius: 8px; padding: 10px;
}
.device-icon { font-size: 14px; color: var(--text-dim); }
.device-icon.on { color: var(--accent-green); }
.device-name { font-size: 11px; color: var(--text-primary); display: block; }
.device-detail { font-size: 9px; color: var(--text-dim); font-family: var(--font-mono); }

/* 滑动解锁 */
.emergency-panel {
  margin: 0 12px 6px;
  padding: 12px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition: border-color 0.3s;
}
.emergency-panel.unlocked { border-color: var(--accent-red); }
.emergency-panel.confirming { border-color: var(--accent-green); }

.slide-track {
  position: relative;
  height: 48px;
  background: var(--bg-card);
  border-radius: 24px;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}
.slide-fill {
  position: absolute; left: 0; top: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--accent-red), var(--accent-orange));
  border-radius: 24px 0 0 24px;
  transition: width 0.1s;
}
.slide-thumb {
  position: absolute; top: 4px;
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--bg-primary);
  border: 2px solid var(--accent-red);
  display: flex; align-items: center; justify-content: center;
  transform: translateX(-50%);
  transition: left 0.1s;
  z-index: 2;
}
.slide-thumb.sliding { border-color: var(--accent-orange); }
.slide-icon { font-size: 16px; color: var(--accent-red); font-weight: 700; }

.emergency-actions {
  display: flex; gap: 6px; margin-top: 10px;
  animation: fadeIn 0.3s ease;
}
.emergency-btn {
  flex: 1; padding: 10px 4px; border: none; border-radius: 8px;
  font-size: 11px; font-weight: 700; cursor: pointer; color: #000;
  transition: transform 0.15s;
}
.emergency-btn:active { transform: scale(0.96); }
.emergency-btn.critical { background: var(--accent-red); }
.emergency-btn.warning { background: var(--accent-orange); }
.emergency-btn.info { background: var(--accent-blue); }
.emergency-hint {
  margin: 8px 0 0;
  font-size: 10px; color: var(--text-dim); text-align: center;
}

/* 告警列表 */
.alert-list { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 4px; }
.alert-row { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 5px 0; border-bottom: 1px solid rgba(30,34,41,0.5); }
.alert-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.alert-dot.red { background: var(--accent-red); }
.alert-dot.yellow { background: var(--accent-orange); }
.alert-dot.green { background: var(--accent-green); }
.alert-time { color: var(--text-dim); font-family: var(--font-mono); min-width: 36px; }
.alert-msg { color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 底部 */
.phone-bottom {
  padding: 10px;
  text-align: center;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
}
.bottom-hint { font-size: 9px; color: var(--text-dim); }
</style>

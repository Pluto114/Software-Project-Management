<template>
  <div v-if="isLoginRoute" class="login-only">
    <router-view />
  </div>

  <div v-else class="app-shell">
    <!-- 顶部状态栏：风险等级 + 告警滚动 -->
    <header class="top-bar" :class="alertLevelClass">
      <div class="top-bar-left">
        <span class="system-label">海湾养殖管理平台</span>
        <span class="divider">|</span>
        <span class="time">{{ currentTime }}</span>
      </div>
      <div class="top-bar-center">
        <div class="risk-indicator" v-if="store.alertLevel !== 'green'">
          <span class="status-dot" :class="store.alertLevel"></span>
          <span class="alert-text" v-if="store.alertLevel === 'red'">
            一级告警：DO 跌破安全阈值，应急增氧已启动
          </span>
          <span class="alert-text alert-scroll" v-else>
            趋势预警：未来 120 分钟 DO 可能跌破 4.5mg/L，建议提前安排增氧
          </span>
        </div>
        <span v-else class="status-normal">系统运行正常 · 全链路延迟 {{ store.e2eLatency }}ms</span>
      </div>
      <div class="top-bar-right">
        <nav class="top-nav">
          <router-link v-if="auth.canAccess('/')" to="/" :class="{ active: route.path === '/' }">生产监控</router-link>
          <router-link v-if="auth.canAccess('/trend-analysis')" to="/trend-analysis" :class="{ active: route.path === '/trend-analysis' }">趋势分析</router-link>
          <router-link v-if="auth.canAccess('/ceo')" to="/ceo" :class="{ active: route.path === '/ceo' }">经营看板</router-link>
          <router-link v-if="auth.canAccess('/assets')" to="/assets" :class="{ active: route.path === '/assets' }">资产管理</router-link>
          <router-link v-if="auth.canAccess('/mobile')" to="/mobile" :class="{ active: route.path === '/mobile' }">移动巡检</router-link>
          <router-link v-if="auth.canAccess('/observability')" to="/observability" :class="{ active: route.path === '/observability' }">系统运维</router-link>
        </nav>
        <div class="user-chip" v-if="auth.user">
          <span class="user-name">{{ auth.user.name }}</span>
          <span class="user-role">{{ auth.user.roleLabel }}</span>
        </div>
        <button class="logout-btn" @click="logout">退出</button>
      </div>
    </header>

    <!-- 主视图 -->
    <router-view />

    <!-- 底部状态栏 -->
    <footer class="bottom-bar">
      <div class="bottom-item">
        <span class="bottom-label">当前身份</span>
        <span class="bottom-value">{{ auth.user?.roleLabel }}</span>
      </div>
      <div class="bottom-item">
        <span class="bottom-label">数据范围</span>
        <span class="bottom-value">{{ auth.user?.scopeLabel }}</span>
      </div>
      <div class="bottom-item" v-if="isOpsView">
        <span class="bottom-label">硬件节点</span>
        <span class="bottom-value">{{ store.onlineNodes }}/{{ store.totalNodes }} 在线</span>
      </div>
      <div class="bottom-item" v-if="isOpsView">
        <span class="bottom-label">网络时延</span>
        <span class="bottom-value">{{ store.networkLatency }}ms</span>
      </div>
      <div class="bottom-item" v-if="isOpsView">
        <span class="bottom-label">消息速率</span>
        <span class="bottom-value">{{ store.msgRate }} msg/s</span>
      </div>
      <div class="bottom-item" v-if="isOpsView">
        <span class="bottom-label">连接数</span>
        <span class="bottom-value">{{ store.wsConnections }}</span>
      </div>
      <div class="bottom-item" v-if="isOpsView">
        <span class="bottom-label">E2E 延迟</span>
        <span class="bottom-value" :class="{ 'text-warning': store.e2eLatency > 150, 'text-danger': store.e2eLatency > 200 }">
          P99 {{ store.e2eLatency }}ms
        </span>
      </div>
      <div class="bottom-item" v-if="!isOpsView">
        <span class="bottom-label">生产状态</span>
        <span class="bottom-value" :class="{ 'text-green': store.alertLevel === 'green', 'text-warning': store.alertLevel === 'yellow', 'text-danger': store.alertLevel === 'red' }">
          {{ productionStatusText }}
        </span>
      </div>
      <div class="bottom-item" v-if="!isOpsView">
        <span class="bottom-label">当班基地</span>
        <span class="bottom-value">{{ auth.user?.allowedBases.join(' / ') || '无生产数据' }}</span>
      </div>
      <div class="bottom-item">
        <span class="bottom-label">系统运行</span>
        <span class="bottom-value">{{ store.uptime }}</span>
      </div>
      <div class="bottom-item">
        <span class="bottom-label">数据源</span>
        <span class="bottom-value" :class="{ 'text-green': connected, 'text-warn': fallbackActive }">
          {{ connected ? 'WS 实时' : fallbackActive ? '模拟数据' : '连接中...' }}
        </span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSensorStore } from './stores/sensorData'
import { useAuthStore } from './stores/auth'
import { useWebSocket } from './composables/useWebSocket'
import { useNotification } from './composables/useNotification'

const route = useRoute()
const router = useRouter()
const store = useSensorStore()
const auth = useAuthStore()
const { connected, fallbackActive, connect } = useWebSocket()
const { ensurePermission } = useNotification()

const isLoginRoute = computed(() => route.path === '/login')
const isOpsView = computed(() => auth.currentRole === 'admin' || auth.currentRole === 'ops')
const productionStatusText = computed(() => {
  if (store.alertLevel === 'red') return '紧急告警'
  if (store.alertLevel === 'yellow') return '趋势预警'
  return '正常运行'
})

function logout() {
  auth.logout()
  router.replace('/login')
}

const currentTime = ref('')
let timer: number
function updateTime() {
  currentTime.value = new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

onMounted(() => {
  // 请求浏览器通知权限 (静默降级)
  ensurePermission()

  // 优先尝试 WebSocket 连接，失败自动降级 Pinia
  connect()
  // 延迟 2s 后若仍未连接，启动模拟数据
  setTimeout(() => {
    if (!connected.value && store.dataSource === 'none') {
      store.startSimulation()
    }
  }, 2000)

  updateTime()
  timer = window.setInterval(updateTime, 1000)
})
onUnmounted(() => clearInterval(timer))

const alertLevelClass = computed(() => {
  if (store.alertLevel === 'red') return 'top-bar-alert-red'
  if (store.alertLevel === 'yellow') return 'top-bar-alert-yellow'
  return ''
})

</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

.login-only {
  min-height: 100vh;
  background: var(--bg-primary);
}

/* 顶部状态栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 0 18px;
  background: #ffffff;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  flex-shrink: 0;
  z-index: 100;
  gap: 18px;
}
.top-bar-alert-red {
  border-bottom-color: var(--accent-red);
}
.top-bar-alert-yellow {
  border-bottom-color: #e7c5a6;
}
.top-bar-left {
  display: flex;
  align-items: center;
  min-width: 260px;
}
.system-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0;
}
.divider { color: var(--border-active); margin: 0 10px; }
.time { color: var(--text-secondary); font-family: var(--font-mono); font-size: 12px; }
.top-bar-center {
  flex: 1;
  min-width: 180px;
  text-align: center;
  overflow: hidden;
}
.risk-indicator { display: flex; align-items: center; justify-content: center; gap: 6px; }
.alert-text { color: var(--accent-orange); font-weight: 600; }
.status-normal { color: var(--accent-green); }
.top-bar-right { display: flex; align-items: center; min-width: 0; gap: 10px; }
.top-nav {
  display: flex;
  gap: 2px;
  flex-wrap: nowrap;
  padding: 3px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-muted);
}
.top-nav a {
  color: var(--text-secondary);
  text-decoration: none;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  transition: background-color 0.15s, color 0.15s;
  white-space: nowrap;
}
.top-nav a:hover, .top-nav a.active {
  color: var(--accent-blue);
  background: #ffffff;
}

.user-chip {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 92px;
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #ffffff;
}

.user-name {
  color: var(--text-primary);
  font-weight: 650;
  line-height: 1.2;
}

.user-role {
  color: var(--text-dim);
  font-size: 11px;
  line-height: 1.2;
}

.logout-btn {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #ffffff;
  color: var(--text-secondary);
  cursor: pointer;
}

.logout-btn:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

/* 底部状态栏 */
.bottom-bar {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 16px;
  background: #ffffff;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  flex-shrink: 0;
  gap: 20px;
  overflow-x: auto;
}
.bottom-item { display: flex; align-items: center; gap: 6px; }
.bottom-label { color: var(--text-dim); white-space: nowrap; }
.bottom-value { color: var(--text-secondary); font-family: var(--font-mono); }
.text-green { color: var(--accent-green); }
.text-warning { color: var(--accent-orange); }
.text-danger { color: var(--accent-red); }
</style>

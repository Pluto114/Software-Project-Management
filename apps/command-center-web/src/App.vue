<template>
  <div class="app-shell">
    <!-- 顶部状态栏：风险等级 + 告警滚动 -->
    <header class="top-bar" :class="alertLevelClass">
      <div class="top-bar-left">
        <span class="system-label">AQUA INTELLIGENCE</span>
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
            二级预警：AI 预测未来 120 分钟 DO 可能跌破 4.5mg/L，建议提前干预
          </span>
        </div>
        <span v-else class="status-normal">系统运行正常 · 全链路延迟 {{ store.e2eLatency }}ms</span>
      </div>
      <div class="top-bar-right">
        <nav class="top-nav">
          <router-link to="/" :class="{ active: route.path === '/' }">3D 指挥舱</router-link>
          <router-link to="/ai-analysis" :class="{ active: route.path === '/ai-analysis' }">AI 分析</router-link>
          <router-link to="/ceo" :class="{ active: route.path === '/ceo' }">管理看板</router-link>
          <router-link to="/mobile" :class="{ active: route.path === '/mobile' }">移动端</router-link>
        </nav>
      </div>
    </header>

    <!-- 主视图 -->
    <router-view />

    <!-- 底部状态栏 -->
    <footer class="bottom-bar">
      <div class="bottom-item">
        <span class="bottom-label">硬件节点</span>
        <span class="bottom-value">{{ store.onlineNodes }}/{{ store.totalNodes }} 在线</span>
      </div>
      <div class="bottom-item">
        <span class="bottom-label">网络时延</span>
        <span class="bottom-value">{{ store.networkLatency }}ms</span>
      </div>
      <div class="bottom-item">
        <span class="bottom-label">消息速率</span>
        <span class="bottom-value">{{ store.msgRate }} msg/s</span>
      </div>
      <div class="bottom-item">
        <span class="bottom-label">连接数</span>
        <span class="bottom-value">{{ store.wsConnections }}</span>
      </div>
      <div class="bottom-item">
        <span class="bottom-label">E2E 延迟</span>
        <span class="bottom-value" :class="{ 'text-warning': store.e2eLatency > 150, 'text-danger': store.e2eLatency > 200 }">
          P99 {{ store.e2eLatency }}ms
        </span>
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
import { useRoute } from 'vue-router'
import { useSensorStore } from './stores/sensorData'
import { useWebSocket } from './composables/useWebSocket'

const route = useRoute()
const store = useSensorStore()
const { connected, fallbackActive, connect } = useWebSocket()

const currentTime = ref('')
let timer: number
onMounted(() => {
  // 优先尝试 WebSocket 连接，失败自动降级 Pinia
  connect()
  // 延迟 2s 后若仍未连接，启动模拟数据
  setTimeout(() => {
    if (!connected.value && store.dataSource === 'none') {
      store.startSimulation()
    }
  }, 2000)

  timer = window.setInterval(() => {
    currentTime.value = new Date().toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }, 1000)
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
}

/* 顶部状态栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  flex-shrink: 0;
  z-index: 100;
}
.top-bar-alert-red {
  border-bottom: 2px solid var(--accent-red);
  animation: breathe-red 2s ease-in-out infinite;
}
.top-bar-alert-yellow {
  border-bottom: 2px solid var(--accent-orange);
}
.system-label {
  font-weight: 700;
  color: var(--accent-blue);
  letter-spacing: 0.12em;
}
.divider { color: var(--text-dim); margin: 0 8px; }
.time { color: var(--text-secondary); font-family: var(--font-mono); }
.top-bar-center { flex: 1; text-align: center; overflow: hidden; }
.risk-indicator { display: flex; align-items: center; justify-content: center; gap: 6px; }
.alert-text { color: var(--accent-orange); font-weight: 600; }
.status-normal { color: var(--accent-green); }
.top-nav { display: flex; gap: 4px; }
.top-nav a {
  color: var(--text-dim);
  text-decoration: none;
  padding: 4px 12px;
  border-radius: 3px;
  font-size: 12px;
  transition: all 0.2s;
}
.top-nav a:hover, .top-nav a.active {
  color: var(--accent-blue);
  background: var(--accent-blue-dim);
}

/* 底部状态栏 */
.bottom-bar {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  flex-shrink: 0;
  gap: 24px;
}
.bottom-item { display: flex; align-items: center; gap: 6px; }
.bottom-label { color: var(--text-dim); text-transform: uppercase; }
.bottom-value { color: var(--text-secondary); font-family: var(--font-mono); }
.text-green { color: var(--accent-green); }
.text-warning { color: var(--accent-orange); }
.text-danger { color: var(--accent-red); }
</style>

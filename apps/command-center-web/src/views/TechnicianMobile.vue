<template>
  <div class="field-page">
    <main class="field-shell">
      <header class="field-header">
        <div>
          <span class="eyebrow">移动巡检</span>
          <h1>现场申请与巡检</h1>
          <p>{{ auth.user?.roleLabel }} · {{ auth.user?.scopeLabel }}</p>
        </div>
        <button class="plain-btn" :disabled="loading" @click="loadFieldData">
          {{ loading ? '刷新中' : '刷新' }}
        </button>
      </header>

      <nav class="pool-tabs" aria-label="养殖池选择">
        <button
          v-for="pool in visiblePools"
          :key="pool.id"
          class="pool-tab"
          :class="{ active: pool.id === activePool }"
          @click="activePool = pool.id"
        >
          <span class="risk-dot" :class="pool.riskLevel"></span>
          {{ pool.id }}
        </button>
      </nav>

      <section class="pool-summary">
        <div>
          <span>当前池</span>
          <strong>{{ currentPool.id }}</strong>
          <em>{{ currentPool.base }} · {{ currentPool.breed }}</em>
        </div>
        <div>
          <span>健康分</span>
          <strong :class="currentPool.riskLevel">{{ currentPool.healthScore }}</strong>
          <em>{{ riskText(currentPool.riskLevel) }}</em>
        </div>
        <div>
          <span>存池量</span>
          <strong>{{ currentPool.fishCount.toLocaleString() }}</strong>
          <em>{{ currentPool.densityPerSqm }} 尾/m² · FCR {{ currentPool.fcr }}</em>
        </div>
      </section>

      <section class="field-panel">
        <div class="panel-heading">
          <div>
            <h2>实时读数</h2>
            <p>先判断风险，再提交需要管理员处理的设备申请。</p>
          </div>
        </div>
        <div class="metric-grid">
          <div v-for="sensor in currentPool.sensors" :key="sensor.key" class="metric-card" :class="sensor.status">
            <span>{{ sensor.label }}</span>
            <strong>{{ sensor.displayValue }} <small>{{ sensor.unit }}</small></strong>
            <em>{{ sensor.thresholdText }}</em>
          </div>
        </div>
      </section>

      <section class="field-panel">
        <div class="panel-heading">
          <div>
            <h2>提交设备申请</h2>
            <p>巡检员只提交申请，管理员处理后才允许现场执行。</p>
          </div>
        </div>

        <div class="action-grid">
          <button
            v-for="action in requestActions"
            :key="action.action_type"
            class="action-card"
            :class="{ urgent: action.priority === 'urgent' }"
            @click="openRequest(action)"
          >
            <strong>{{ action.action_label }}</strong>
            <span>{{ action.device_name }}</span>
            <em>{{ action.priority === 'urgent' ? '高风险' : '普通' }}</em>
          </button>
        </div>

        <form v-if="requestForm.open" class="request-form" @submit.prevent="submitRequest">
          <div class="form-title">
            <span>{{ requestForm.device_name }}</span>
            <strong>{{ requestForm.action_label }}</strong>
          </div>

          <label>
            申请原因
            <select v-model="requestForm.reason" required>
              <option value="">请选择原因</option>
              <option value="水质指标接近预警线">水质指标接近预警线</option>
              <option value="现场发现设备异常">现场发现设备异常</option>
              <option value="投喂或残饵情况需要调整">投喂或残饵情况需要调整</option>
              <option value="主管要求现场提交申请">主管要求现场提交申请</option>
            </select>
          </label>

          <label>
            现场说明
            <textarea v-model.trim="requestForm.note" rows="3" placeholder="写清楚读数、池边情况或照片编号"></textarea>
          </label>

          <label v-if="requestForm.priority === 'urgent'">
            高风险确认
            <input v-model.trim="requestForm.safety_text" placeholder="输入：现场确认" />
          </label>

          <div class="form-actions">
            <button type="button" class="plain-btn" @click="resetRequestForm">取消</button>
            <button class="primary-btn" type="submit" :disabled="submitting">
              {{ submitting ? '提交中' : '提交给管理员' }}
            </button>
          </div>
        </form>

        <p v-if="message.text" class="message-line" :class="message.kind">{{ message.text }}</p>
      </section>

      <section class="field-panel">
        <div class="panel-heading">
          <div>
            <h2>我的申请</h2>
            <p>管理员处理结果会显示在这里。</p>
          </div>
        </div>

        <div v-if="visibleRequests.length === 0" class="empty-state">
          暂无申请。
        </div>

        <article v-for="request in visibleRequests" :key="request.id" class="request-row">
          <div class="request-main">
            <div class="request-title">
              <strong>{{ request.pool_code }} · {{ request.action_label }}</strong>
              <span class="status-pill" :class="request.status">{{ statusLabel(request) }}</span>
            </div>
            <p>{{ request.device_name }} · {{ request.reason }}</p>
            <p v-if="request.review_message" class="review-text">
              管理员意见：{{ request.review_message }}
            </p>
            <p v-if="request.completion_note" class="review-text">
              执行说明：{{ request.completion_note }}
            </p>
          </div>
          <div class="request-side">
            <span>{{ formatTime(request.requested_at) }}</span>
            <button v-if="request.status === 'approved'" class="primary-btn small" @click="confirmRequest(request)">
              确认已执行
            </button>
          </div>
        </article>
      </section>

      <section class="field-panel">
        <div class="panel-heading">
          <div>
            <h2>今日巡检</h2>
            <p>按任务逐项检查，完成后记录到后端。</p>
          </div>
        </div>

        <div v-if="visibleTasks.length === 0" class="empty-state">
          暂无巡检任务。
        </div>

        <article v-for="task in visibleTasks" :key="task.id" class="task-row" :class="{ done: task.status === 'completed' }">
          <div>
            <strong>{{ task.pool_code }} · {{ task.title }}</strong>
            <p>{{ task.due_time }} · {{ task.checklist.join(' / ') }}</p>
          </div>
          <button class="plain-btn" :disabled="task.status === 'completed'" @click="completeTask(task)">
            {{ task.status === 'completed' ? '已完成' : '完成巡检' }}
          </button>
        </article>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

type RiskLevel = 'green' | 'yellow' | 'red'
type SensorStatus = 'normal' | 'warning' | 'danger'
type RequestStatus = 'waiting_review' | 'approved' | 'rejected' | 'completed'
type Priority = 'normal' | 'urgent'

interface SensorInfo {
  key: string
  label: string
  value: number
  displayValue: string
  unit: string
  status: SensorStatus
  thresholdText: string
}

interface PoolData {
  id: string
  base: string
  breed: string
  fishCount: number
  densityPerSqm: number
  status: 'active' | 'maintenance' | 'idle'
  survivalRate: number
  fcr: number
  healthScore: number
  riskLevel: RiskLevel
  sensors: SensorInfo[]
  latestBatchCode?: string
}

interface BackendProductionPool {
  id: string
  pool_code: string
  base_name: string
  breed: string
  fish_count: number
  area_sqm: number
  water_depth_m: number
  status: 'active' | 'maintenance' | 'idle'
  manager: string
  density_per_sqm?: number
  active_batch_count?: number
  latest_batch?: {
    batch_code: string
    breed: string
    quantity: number
    stocked_at: number
  } | null
}

interface FieldRequest {
  id: string
  request_no: string
  base_name: string
  pool_code: string
  device_name: string
  action_type: string
  action_label: string
  priority: Priority
  reason: string
  note: string
  status: RequestStatus
  status_label: string
  requested_by_name: string
  requested_at: number
  review_message?: string
  completion_note?: string
}

interface FieldTask {
  id: string
  task_no: string
  base_name: string
  pool_code: string
  title: string
  due_time: string
  assignee: string
  status: 'pending' | 'completed'
  checklist: string[]
  result_note?: string
}

interface RequestAction {
  device_name: string
  action_type: string
  action_label: string
  priority: Priority
}

const THRESHOLDS: Record<string, { green: [number, number]; yellow: [number, number]; unit: string; label: string }> = {
  DO: { green: [5.5, 9], yellow: [4.5, 5.5], unit: 'mg/L', label: '溶氧' },
  TEMP: { green: [22, 28], yellow: [28, 30], unit: '℃', label: '水温' },
  pH: { green: [7.0, 8.0], yellow: [6.5, 8.5], unit: 'pH', label: 'pH' },
  NH3N: { green: [0, 0.2], yellow: [0.2, 0.3], unit: 'mg/L', label: '氨氮' },
}

function makeSensor(key: string, value: number): SensorInfo {
  const t = THRESHOLDS[key]
  const status = evaluate(key, value)
  return {
    key,
    label: t.label,
    value,
    displayValue: value.toFixed(key === 'pH' ? 1 : 2),
    unit: t.unit,
    status,
    thresholdText: `正常 ${t.green[0]}-${t.green[1]} ${t.unit}`,
  }
}

function evaluate(key: string, value: number): SensorStatus {
  const t = THRESHOLDS[key]
  if (value >= t.green[0] && value <= t.green[1]) return 'normal'
  if (value >= t.yellow[0] && value <= t.yellow[1]) return 'warning'
  return 'danger'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function poolNumber(poolCode: string) {
  const parsed = Number(poolCode.replace(/\D/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function riskFromHealth(score: number, status: BackendProductionPool['status']): RiskLevel {
  if (status === 'maintenance' || score < 55) return 'red'
  if (score < 75) return 'yellow'
  return 'green'
}

function toPoolData(pool: BackendProductionPool): PoolData {
  const index = poolNumber(pool.pool_code)
  const density = pool.density_per_sqm ?? (pool.area_sqm > 0 ? Math.round((pool.fish_count / pool.area_sqm) * 100) / 100 : 0)
  const isIdle = pool.status === 'idle' || pool.fish_count === 0
  const doValue = isIdle ? 6.2 : clamp(6.25 - density / 18 - (index % 3) * 0.12, 4.65, 6.3)
  const tempValue = clamp(26.4 + (index % 5) * 0.35 + density / 80, 24.5, 29.2)
  const phValue = clamp(7.35 + (index % 4) * 0.12, 7.1, 8.1)
  const nh3nValue = clamp(0.1 + density / 220 + (index % 3) * 0.015, 0.08, 0.28)
  const pressurePenalty = isIdle ? -5 : density > 25 ? 18 : density > 18 ? 10 : 0
  const statusPenalty = pool.status === 'maintenance' ? 35 : 0
  const healthScore = clamp(Math.round(94 - pressurePenalty - statusPenalty - (index % 4) * 2), 42, 96)

  return {
    id: pool.pool_code,
    base: pool.base_name,
    breed: pool.breed,
    fishCount: pool.fish_count,
    densityPerSqm: density,
    status: pool.status,
    survivalRate: clamp(Math.round(98 - pressurePenalty / 2 - (index % 3)), 70, 99),
    fcr: Number((1.18 + density / 90 + (index % 4) * 0.03).toFixed(2)),
    healthScore,
    riskLevel: riskFromHealth(healthScore, pool.status),
    sensors: [
      makeSensor('DO', doValue),
      makeSensor('pH', phValue),
      makeSensor('TEMP', tempValue),
      makeSensor('NH3N', nh3nValue),
    ],
    latestBatchCode: pool.latest_batch?.batch_code,
  }
}

const fallbackPools: PoolData[] = [
  {
    id: 'P01',
    base: 'A基地',
    breed: '石斑鱼',
    fishCount: 12000,
    densityPerSqm: 24,
    status: 'active',
    survivalRate: 94,
    fcr: 1.28,
    healthScore: 87,
    riskLevel: 'green',
    sensors: [makeSensor('DO', 5.8), makeSensor('pH', 7.6), makeSensor('TEMP', 27.2), makeSensor('NH3N', 0.15)],
  },
  {
    id: 'P02',
    base: 'A基地',
    breed: '石斑鱼',
    fishCount: 10500,
    densityPerSqm: 21,
    status: 'active',
    survivalRate: 88,
    fcr: 1.35,
    healthScore: 68,
    riskLevel: 'yellow',
    sensors: [makeSensor('DO', 5.2), makeSensor('pH', 7.4), makeSensor('TEMP', 27.8), makeSensor('NH3N', 0.18)],
  },
  {
    id: 'P03',
    base: 'A基地',
    breed: '珍珠龙胆',
    fishCount: 8000,
    densityPerSqm: 16,
    status: 'active',
    survivalRate: 97,
    fcr: 1.22,
    healthScore: 92,
    riskLevel: 'green',
    sensors: [makeSensor('DO', 6.1), makeSensor('pH', 7.8), makeSensor('TEMP', 26.8), makeSensor('NH3N', 0.12)],
  },
  {
    id: 'P04',
    base: 'B基地',
    breed: '东星斑',
    fishCount: 15000,
    densityPerSqm: 23.08,
    status: 'active',
    survivalRate: 72,
    fcr: 1.42,
    healthScore: 41,
    riskLevel: 'red',
    sensors: [makeSensor('DO', 4.8), makeSensor('pH', 7.2), makeSensor('TEMP', 28.4), makeSensor('NH3N', 0.25)],
  },
]

const pools = ref<PoolData[]>(fallbackPools)

const requestActions: RequestAction[] = [
  { device_name: '增氧机 #01', action_type: 'device_stop', action_label: '停用设备', priority: 'normal' },
  { device_name: '增氧机 #02', action_type: 'device_start', action_label: '启用设备', priority: 'normal' },
  { device_name: '投喂器 #01', action_type: 'stop_feed', action_label: '暂停投喂', priority: 'normal' },
  { device_name: '增氧机组', action_type: 'full_aeration', action_label: '全负荷增氧', priority: 'urgent' },
]

const activePool = ref('P01')
const loading = ref(false)
const submitting = ref(false)
const requests = ref<FieldRequest[]>([])
const tasks = ref<FieldTask[]>([])
const message = ref<{ kind: 'success' | 'error' | 'idle'; text: string }>({ kind: 'idle', text: '' })

const requestForm = ref({
  open: false,
  device_name: '',
  action_type: '',
  action_label: '',
  priority: 'normal' as Priority,
  reason: '',
  note: '',
  safety_text: '',
})

const visiblePools = computed(() => pools.value.filter(pool => auth.canSeeBase(pool.base)))
const currentPool = computed(() => visiblePools.value.find(pool => pool.id === activePool.value) || visiblePools.value[0] || pools.value[0])
const visibleRequests = computed(() => requests.value.slice(0, 6))
const visibleTasks = computed(() => tasks.value.slice(0, 4))

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...auth.getAuthHeaders(),
      ...(init?.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

async function loadFieldData() {
  loading.value = true
  try {
    const [poolRes, taskRes, requestRes] = await Promise.all([
      api<{ pools: BackendProductionPool[] }>('/api/v1/production/pools'),
      api<{ tasks: FieldTask[] }>('/api/v1/field/tasks'),
      api<{ requests: FieldRequest[] }>('/api/v1/field/requests'),
    ])
    const loadedPools = poolRes.pools.map(toPoolData)
    pools.value = loadedPools.length ? loadedPools : fallbackPools
    if (!pools.value.some(pool => pool.id === activePool.value)) {
      activePool.value = pools.value[0]?.id || 'P01'
    }
    tasks.value = taskRes.tasks
    requests.value = requestRes.requests
  } catch (err) {
    showMessage('error', err instanceof Error ? err.message : '现场数据加载失败')
  } finally {
    loading.value = false
  }
}

function openRequest(action: RequestAction) {
  requestForm.value = {
    open: true,
    device_name: action.device_name,
    action_type: action.action_type,
    action_label: action.action_label,
    priority: action.priority,
    reason: '',
    note: '',
    safety_text: '',
  }
}

function resetRequestForm() {
  requestForm.value = {
    open: false,
    device_name: '',
    action_type: '',
    action_label: '',
    priority: 'normal',
    reason: '',
    note: '',
    safety_text: '',
  }
}

async function submitRequest() {
  submitting.value = true
  try {
    const payload = {
      base_name: currentPool.value.base,
      pool_code: currentPool.value.id,
      device_name: requestForm.value.device_name,
      action_type: requestForm.value.action_type,
      action_label: requestForm.value.action_label,
      priority: requestForm.value.priority,
      reason: requestForm.value.reason,
      note: requestForm.value.note,
      safety_text: requestForm.value.safety_text,
    }
    const res = await api<{ request: FieldRequest }>('/api/v1/field/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    requests.value.unshift(res.request)
    resetRequestForm()
    showMessage('success', '申请已提交，等待管理员处理。')
  } catch (err) {
    showMessage('error', err instanceof Error ? err.message : '提交失败')
  } finally {
    submitting.value = false
  }
}

async function confirmRequest(request: FieldRequest) {
  try {
    const res = await api<{ request: FieldRequest }>(`/api/v1/field/requests/${request.id}/confirm`, {
      method: 'PATCH',
      body: JSON.stringify({ message: `${request.pool_code} ${request.action_label} 已按管理员意见执行。` }),
    })
    requests.value = requests.value.map(item => item.id === request.id ? res.request : item)
    showMessage('success', '已确认完成。')
  } catch (err) {
    showMessage('error', err instanceof Error ? err.message : '确认失败')
  }
}

async function completeTask(task: FieldTask) {
  try {
    const res = await api<{ task: FieldTask }>(`/api/v1/field/tasks/${task.id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ note: `${task.pool_code} 巡检完成，指标已检查。` }),
    })
    tasks.value = tasks.value.map(item => item.id === task.id ? res.task : item)
    showMessage('success', '巡检任务已完成。')
  } catch (err) {
    showMessage('error', err instanceof Error ? err.message : '巡检任务保存失败')
  }
}

function showMessage(kind: 'success' | 'error' | 'idle', text: string) {
  message.value = { kind, text }
}

function statusLabel(request: FieldRequest) {
  const labels: Record<RequestStatus, string> = {
    waiting_review: '待管理员处理',
    approved: '已同意',
    rejected: '已驳回',
    completed: '已完成',
  }
  return request.status_label || labels[request.status]
}

function riskText(level: RiskLevel) {
  if (level === 'red') return '需重点关注'
  if (level === 'yellow') return '注意观察'
  return '状态稳定'
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(loadFieldData)
</script>

<style scoped>
.field-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--bg-primary);
  padding: 16px;
}

.field-shell {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-header,
.pool-summary,
.field-panel {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.field-header {
  min-height: 92px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.eyebrow {
  display: block;
  color: var(--accent-blue);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
}

.field-header h1 {
  color: var(--text-primary);
  font-size: 24px;
  line-height: 1.2;
  margin: 0 0 4px;
}

.field-header p,
.panel-heading p,
.request-row p,
.task-row p,
.pool-summary em,
.metric-card em {
  color: var(--text-secondary);
  font-size: 12px;
  font-style: normal;
}

.pool-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.pool-tab,
.plain-btn,
.primary-btn,
.action-card {
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}

.pool-tab {
  min-width: 76px;
  height: 36px;
  border: 1px solid var(--border-color);
  background: #ffffff;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.pool-tab.active {
  color: var(--accent-blue);
  border-color: var(--accent-blue);
  background: var(--accent-blue-dim);
  font-weight: 700;
}

.risk-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.risk-dot.green {
  background: var(--accent-green);
}

.risk-dot.yellow {
  background: var(--accent-orange);
}

.risk-dot.red {
  background: var(--accent-red);
}

.pool-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.pool-summary div {
  padding: 14px 16px;
  border-right: 1px solid var(--border-color);
}

.pool-summary div:last-child {
  border-right: none;
}

.pool-summary span,
.metric-card span {
  display: block;
  color: var(--text-dim);
  font-size: 12px;
}

.pool-summary strong {
  display: block;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 24px;
  line-height: 1.2;
  margin: 4px 0;
}

.pool-summary strong.green {
  color: var(--accent-green);
}

.pool-summary strong.yellow {
  color: var(--accent-orange);
}

.pool-summary strong.red {
  color: var(--accent-red);
}

.field-panel {
  padding: 14px;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-heading h2 {
  font-size: 16px;
  line-height: 1.3;
  margin: 0 0 3px;
  color: var(--text-primary);
}

.metric-grid,
.action-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.metric-card {
  min-height: 92px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-muted);
}

.metric-card.warning {
  border-color: #e7c5a6;
  background: var(--accent-orange-dim);
}

.metric-card.danger {
  border-color: #e3b7b4;
  background: var(--accent-red-dim);
}

.metric-card strong {
  display: block;
  margin: 8px 0 4px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 22px;
  line-height: 1.1;
}

.metric-card small {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.action-card {
  min-height: 92px;
  padding: 12px;
  border: 1px solid var(--border-color);
  background: #ffffff;
  text-align: left;
}

.action-card:hover {
  border-color: var(--accent-blue);
  background: var(--accent-blue-dim);
}

.action-card.urgent {
  border-color: #e7c5a6;
}

.action-card strong,
.action-card span,
.action-card em {
  display: block;
}

.action-card strong {
  color: var(--text-primary);
  font-size: 14px;
}

.action-card span {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.action-card em {
  margin-top: 10px;
  color: var(--accent-blue);
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}

.action-card.urgent em {
  color: var(--accent-orange);
}

.request-form {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-muted);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.form-title {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.form-title strong {
  color: var(--text-primary);
}

.request-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.request-form label:nth-of-type(2) {
  grid-column: 1 / -1;
}

.request-form select,
.request-form input,
.request-form textarea {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #ffffff;
  color: var(--text-primary);
  padding: 8px 10px;
  outline: none;
  resize: vertical;
}

.request-form select,
.request-form input {
  min-height: 34px;
}

.request-form select:focus,
.request-form input:focus,
.request-form textarea:focus {
  border-color: var(--accent-blue);
}

.form-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.plain-btn,
.primary-btn {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  background: #ffffff;
  color: var(--text-secondary);
  font-weight: 600;
}

.plain-btn:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.plain-btn:disabled,
.primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary-btn {
  border-color: var(--accent-blue);
  background: var(--accent-blue);
  color: #ffffff;
}

.primary-btn.small {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
}

.message-line {
  margin-top: 10px;
  padding: 9px 10px;
  border-radius: 6px;
  font-size: 13px;
}

.message-line.success {
  color: var(--accent-green);
  background: var(--accent-green-dim);
}

.message-line.error {
  color: var(--accent-red);
  background: var(--accent-red-dim);
}

.empty-state {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  color: var(--text-dim);
  font-size: 13px;
  background: var(--bg-muted);
}

.request-row,
.task-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #ffffff;
}

.request-row + .request-row,
.task-row + .task-row {
  margin-top: 8px;
}

.request-main {
  min-width: 0;
  flex: 1;
}

.request-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.request-title strong,
.task-row strong {
  color: var(--text-primary);
  font-size: 14px;
}

.review-text {
  margin-top: 5px;
  color: var(--text-primary);
}

.request-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  color: var(--text-dim);
  font-size: 12px;
  white-space: nowrap;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  font-size: 12px;
  font-weight: 700;
  background: #ffffff;
}

.status-pill.waiting_review {
  color: var(--accent-orange);
  border-color: #e7c5a6;
  background: var(--accent-orange-dim);
}

.status-pill.approved {
  color: var(--accent-blue);
  border-color: #bfd6df;
  background: var(--accent-blue-dim);
}

.status-pill.rejected {
  color: var(--accent-red);
  border-color: #e3b7b4;
  background: var(--accent-red-dim);
}

.status-pill.completed {
  color: var(--accent-green);
  border-color: #b9d7c6;
  background: var(--accent-green-dim);
}

.task-row.done {
  opacity: 0.7;
}

@media (max-width: 820px) {
  .field-page {
    padding: 10px;
  }

  .field-header,
  .pool-summary,
  .request-row,
  .task-row {
    flex-direction: column;
    align-items: stretch;
  }

  .pool-summary {
    grid-template-columns: 1fr;
  }

  .pool-summary div {
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .pool-summary div:last-child {
    border-bottom: none;
  }

  .metric-grid,
  .action-grid,
  .request-form {
    grid-template-columns: 1fr;
  }

  .request-side {
    align-items: flex-start;
  }
}
</style>

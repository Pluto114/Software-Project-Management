<template>
  <div class="asset-layout">
    <main class="asset-main">
      <div class="scope-strip">
        <span>{{ auth.user?.roleLabel }}</span>
        <strong>{{ auth.user?.scopeLabel }}</strong>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">养殖池总数</span>
          <strong>{{ summary.total_pools }}</strong>
          <span class="summary-sub">{{ summary.active_pools }} 个运行中</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">存池总量</span>
          <strong>{{ summary.total_fish.toLocaleString() }}</strong>
          <span class="summary-sub">尾</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">在养批次</span>
          <strong>{{ summary.active_batches }}</strong>
          <span class="summary-sub">批</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">平均密度</span>
          <strong>{{ summary.avg_density_per_sqm }}</strong>
          <span class="summary-sub">尾/m²</span>
        </div>
      </div>

      <section class="panel review-panel">
        <div class="panel-header">
          <div>
            <span class="panel-title">现场申请处理</span>
            <div class="panel-hint">巡检员提交的设备操作申请会在这里处理，并把意见返回手机端</div>
          </div>
          <div class="panel-actions">
            <span class="batch-count">{{ pendingReviewCount }} 条待处理</span>
            <button class="asset-btn secondary" @click="loadFieldRequests" :disabled="fieldLoading">刷新</button>
          </div>
        </div>

        <div v-if="visibleFieldRequests.length === 0" class="review-empty">
          暂无现场申请。
        </div>

        <div v-else class="review-list">
          <article v-for="request in visibleFieldRequests" :key="request.id" class="review-row">
            <div class="review-info">
              <div class="review-title">
                <strong>{{ request.pool_code }} · {{ request.action_label }}</strong>
                <span class="request-status" :class="request.status">{{ requestStatusText(request) }}</span>
              </div>
              <div class="review-meta">
                {{ request.base_name }} · {{ request.device_name }} · {{ request.requested_by_name }} · {{ formatDateTime(request.requested_at) }}
              </div>
              <div class="review-reason">{{ request.reason }}</div>
              <div v-if="request.review_message" class="review-message">
                管理员意见：{{ request.review_message }}
              </div>
            </div>
            <div class="review-action-box">
              <textarea
                v-if="request.status === 'waiting_review'"
                v-model.trim="reviewNotes[request.id]"
                rows="2"
                placeholder="填写给巡检员的处理意见"
              ></textarea>
              <div v-if="request.status === 'waiting_review'" class="review-actions">
                <button class="asset-btn primary" @click="reviewFieldRequest(request, true)">同意</button>
                <button class="asset-btn danger-outline" @click="reviewFieldRequest(request, false)">驳回</button>
              </div>
              <span v-else class="review-done">{{ requestStatusText(request) }}</span>
            </div>
          </article>
        </div>
      </section>

      <section class="panel table-panel">
        <div class="panel-header">
          <div>
            <span class="panel-title">养殖池资产管理</span>
            <div class="panel-hint">维护池塘档案、负责人、面积和存池状态</div>
          </div>
          <div class="panel-actions">
            <button class="asset-btn secondary" @click="loadAll" :disabled="loading">刷新</button>
            <button v-if="canManageAssets" class="asset-btn primary" @click="resetPoolForm">新增池子</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="asset-table">
            <thead>
              <tr>
                <th>池号</th>
                <th>基地</th>
                <th>鱼种</th>
                <th>存池量</th>
                <th>面积</th>
                <th>密度</th>
                <th>负责人</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="pool in pools"
                :key="pool.id"
                :class="{ selected: pool.id === selectedPoolId }"
                @click="selectPool(pool)"
              >
                <td class="pool-code">{{ pool.pool_code }}</td>
                <td>{{ pool.base_name }}</td>
                <td>{{ pool.breed }}</td>
                <td class="mono">{{ pool.fish_count.toLocaleString() }}</td>
                <td class="mono">{{ pool.area_sqm }} m²</td>
                <td class="mono">{{ density(pool) }}</td>
                <td>{{ pool.manager }}</td>
                <td>
                  <span class="status-pill" :class="pool.status">{{ statusText(pool.status) }}</span>
                </td>
                <td class="row-actions" @click.stop>
                  <button class="text-action" @click="editPool(pool)">编辑</button>
                  <button class="text-action" @click="prepareStock(pool)">投苗</button>
                  <button v-if="canDeletePools" class="text-action danger" :disabled="pool.fish_count > 0" @click="deletePool(pool)">
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel batch-panel">
        <div class="panel-header">
          <div>
            <span class="panel-title">投放批次记录</span>
            <div class="panel-hint">按选中池塘筛选入池批次和苗源信息</div>
          </div>
          <span class="batch-count">{{ filteredBatches.length }} 条</span>
        </div>

        <div class="batch-list">
          <div class="batch-row" v-for="batch in filteredBatches" :key="batch.id">
            <div>
              <div class="batch-code">{{ batch.batch_code }}</div>
              <div class="batch-meta">{{ poolCodeOf(batch.pool_id) }} · {{ batch.breed }} · {{ batch.source }}</div>
            </div>
            <div class="batch-stat">
              <strong>{{ batch.quantity.toLocaleString() }}</strong>
              <span>尾</span>
            </div>
            <div class="batch-stat">
              <strong>{{ batch.avg_weight_kg }}</strong>
              <span>kg/尾</span>
            </div>
            <div class="batch-date">{{ formatDate(batch.stocked_at) }}</div>
          </div>
        </div>
      </section>
    </main>

    <aside class="asset-side">
      <section class="panel form-panel">
        <div class="panel-header">
          <span class="panel-title">{{ editingPoolId ? '编辑养殖池' : '新增养殖池' }}</span>
          <span class="side-label">档案维护</span>
        </div>
        <div class="form-grid">
          <label>
            池号
            <input v-model.trim="poolForm.pool_code" placeholder="P09" />
          </label>
          <label>
            基地
            <input v-model.trim="poolForm.base_name" placeholder="A基地" />
          </label>
          <label>
            鱼种
            <input v-model.trim="poolForm.breed" placeholder="石斑鱼" />
          </label>
          <label>
            面积 m²
            <input v-model.number="poolForm.area_sqm" type="number" min="1" />
          </label>
          <label>
            水深 m
            <input v-model.number="poolForm.water_depth_m" type="number" min="0.1" step="0.1" />
          </label>
          <label>
            负责人
            <input v-model.trim="poolForm.manager" placeholder="管理员" />
          </label>
          <label class="full">
            状态
            <select v-model="poolForm.status">
              <option value="idle">空闲</option>
              <option value="active">运行中</option>
              <option value="maintenance">维护中</option>
            </select>
          </label>
        </div>
        <div class="form-actions">
          <button class="asset-btn secondary" @click="resetPoolForm">清空</button>
          <button class="asset-btn primary" @click="submitPool" :disabled="submitting">
            {{ editingPoolId ? '保存修改' : '创建池子' }}
          </button>
        </div>
      </section>

      <section class="panel form-panel">
        <div class="panel-header">
          <span class="panel-title">投放鱼苗</span>
          <span class="side-label green">批次入池</span>
        </div>
        <div class="form-grid">
          <label class="full">
            目标池
            <select v-model="stockForm.pool_id">
              <option v-for="pool in pools" :key="pool.id" :value="pool.id">
                {{ pool.pool_code }} · {{ pool.base_name }}
              </option>
            </select>
          </label>
          <label>
            鱼种
            <input v-model.trim="stockForm.breed" placeholder="珍珠龙胆" />
          </label>
          <label>
            数量
            <input v-model.number="stockForm.quantity" type="number" min="1" />
          </label>
          <label>
            均重 kg
            <input v-model.number="stockForm.avg_weight_kg" type="number" min="0.001" step="0.001" />
          </label>
          <label>
            来源
            <input v-model.trim="stockForm.source" placeholder="本地苗场" />
          </label>
          <label class="full">
            备注
            <input v-model.trim="stockForm.note" placeholder="批次说明" />
          </label>
        </div>
        <div class="form-actions">
          <button class="asset-btn primary wide" @click="submitStock" :disabled="submitting || !stockForm.pool_id">
            确认投放
          </button>
        </div>
      </section>

      <section class="panel detail-panel">
        <div class="panel-header">
          <span class="panel-title">操作回执</span>
          <span class="side-label blue">实时记录</span>
        </div>
        <div class="receipt" :class="lastReceipt.kind">
          <div class="receipt-title">{{ lastReceipt.title }}</div>
          <div class="receipt-body">{{ lastReceipt.body }}</div>
        </div>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

type PoolStatus = 'active' | 'maintenance' | 'idle'

interface Pool {
  id: string
  pool_code: string
  base_name: string
  breed: string
  fish_count: number
  area_sqm: number
  water_depth_m: number
  status: PoolStatus
  manager: string
  created_at: number
  updated_at: number
}

interface FishBatch {
  id: string
  pool_id: string
  batch_code: string
  breed: string
  quantity: number
  avg_weight_kg: number
  source: string
  stocked_at: number
  status: 'active' | 'harvested'
  note: string
}

interface FieldRequest {
  id: string
  request_no: string
  base_name: string
  pool_code: string
  device_name: string
  action_type: string
  action_label: string
  priority: 'normal' | 'urgent'
  reason: string
  note: string
  status: 'waiting_review' | 'approved' | 'rejected' | 'completed'
  status_label: string
  requested_by_name: string
  requested_at: number
  review_message?: string
}

interface Summary {
  total_pools: number
  active_pools: number
  total_fish: number
  active_batches: number
  total_area_sqm: number
  avg_density_per_sqm: number
}

const emptySummary: Summary = {
  total_pools: 0,
  active_pools: 0,
  total_fish: 0,
  active_batches: 0,
  total_area_sqm: 0,
  avg_density_per_sqm: 0,
}

const loading = ref(false)
const submitting = ref(false)
const auth = useAuthStore()
const pools = ref<Pool[]>([])
const batches = ref<FishBatch[]>([])
const fieldRequests = ref<FieldRequest[]>([])
const fieldLoading = ref(false)
const reviewNotes = reactive<Record<string, string>>({})
const summary = reactive<Summary>({ ...emptySummary })
const selectedPoolId = ref('')
const editingPoolId = ref('')

const poolForm = reactive({
  pool_code: '',
  base_name: 'A基地',
  breed: '待投放',
  area_sqm: 500,
  water_depth_m: 1.6,
  status: 'idle' as PoolStatus,
  manager: '管理员',
})

const stockForm = reactive({
  pool_id: '',
  breed: '石斑鱼',
  quantity: 1000,
  avg_weight_kg: 0.02,
  source: '本地苗场',
  note: '',
})

const lastReceipt = reactive({
  kind: 'idle',
  title: '等待操作',
  body: '新增池子、编辑资产或投放鱼苗后，这里会显示后端返回的结果。',
})

const filteredBatches = computed(() => {
  if (!selectedPoolId.value) return batches.value
  return batches.value.filter(batch => batch.pool_id === selectedPoolId.value)
})
const canManageAssets = computed(() => auth.hasPermission('asset:write'))
const canDeletePools = computed(() => auth.hasPermission('asset:delete'))
const visibleFieldRequests = computed(() => fieldRequests.value.slice(0, 6))
const pendingReviewCount = computed(() => fieldRequests.value.filter(request => request.status === 'waiting_review').length)

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

async function loadAll() {
  loading.value = true
  try {
    const [summaryRes, poolRes, batchRes] = await Promise.all([
      api<Summary>('/api/v1/management/summary'),
      api<{ pools: Pool[] }>('/api/v1/management/pools'),
      api<{ batches: FishBatch[] }>('/api/v1/management/batches'),
    ])
    Object.assign(summary, summaryRes)
    pools.value = poolRes.pools
    batches.value = batchRes.batches
    if (!selectedPoolId.value && pools.value.length > 0) {
      selectedPoolId.value = pools.value[0].id
      stockForm.pool_id = pools.value[0].id
      stockForm.breed = pools.value[0].breed
    }
    await loadFieldRequests()
  } catch (err) {
    showReceipt('error', '后端请求失败', err instanceof Error ? err.message : '未知错误')
  } finally {
    loading.value = false
  }
}

async function loadFieldRequests() {
  fieldLoading.value = true
  try {
    const res = await api<{ requests: FieldRequest[] }>('/api/v1/field/requests')
    fieldRequests.value = res.requests
    res.requests.forEach(request => {
      if (!reviewNotes[request.id]) {
        reviewNotes[request.id] = ''
      }
    })
  } catch (err) {
    showReceipt('error', '现场申请加载失败', err instanceof Error ? err.message : '未知错误')
  } finally {
    fieldLoading.value = false
  }
}

async function reviewFieldRequest(request: FieldRequest, approved: boolean) {
  submitting.value = true
  try {
    const message = reviewNotes[request.id] || (approved ? '同意。执行前确认人员安全，完成后在手机端确认。' : '驳回。请补充现场照片或读数后重新提交。')
    const res = await api<{ request: FieldRequest }>(`/api/v1/field/requests/${request.id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, message }),
    })
    fieldRequests.value = fieldRequests.value.map(item => item.id === request.id ? res.request : item)
    reviewNotes[request.id] = ''
    showReceipt('success', approved ? '已同意申请' : '已驳回申请', `${request.pool_code} · ${request.action_label} 的处理意见已返回巡检员。`)
  } catch (err) {
    showReceipt('error', '处理失败', err instanceof Error ? err.message : '未知错误')
  } finally {
    submitting.value = false
  }
}

function resetPoolForm() {
  editingPoolId.value = ''
  Object.assign(poolForm, {
    pool_code: nextPoolCode(),
    base_name: 'A基地',
    breed: '待投放',
    area_sqm: 500,
    water_depth_m: 1.6,
    status: 'idle',
    manager: '管理员',
  })
}

function editPool(pool: Pool) {
  editingPoolId.value = pool.id
  Object.assign(poolForm, {
    pool_code: pool.pool_code,
    base_name: pool.base_name,
    breed: pool.breed,
    area_sqm: pool.area_sqm,
    water_depth_m: pool.water_depth_m,
    status: pool.status,
    manager: pool.manager,
  })
  selectedPoolId.value = pool.id
}

function selectPool(pool: Pool) {
  selectedPoolId.value = pool.id
  stockForm.pool_id = pool.id
  stockForm.breed = pool.breed === '待投放' ? stockForm.breed : pool.breed
}

function prepareStock(pool: Pool) {
  selectPool(pool)
  stockForm.quantity = 1000
  showReceipt('idle', '已选择投放目标', `${pool.pool_code} · ${pool.base_name} · 当前 ${pool.fish_count.toLocaleString()} 尾`)
}

async function submitPool() {
  submitting.value = true
  try {
    const body = JSON.stringify(poolForm)
    if (editingPoolId.value) {
      const res = await api<{ pool: Pool }>(`/api/v1/management/pools/${editingPoolId.value}`, {
        method: 'PUT',
        body,
      })
      showReceipt('success', '池子已更新', `${res.pool.pool_code} 已保存到后端资产服务。`)
    } else {
      const res = await api<{ pool: Pool }>('/api/v1/management/pools', {
        method: 'POST',
        body,
      })
      selectedPoolId.value = res.pool.id
      stockForm.pool_id = res.pool.id
      showReceipt('success', '池子已创建', `${res.pool.pool_code} 已写入后端，可继续投放鱼苗。`)
    }
    await loadAll()
    resetPoolForm()
  } catch (err) {
    showReceipt('error', '保存失败', err instanceof Error ? err.message : '未知错误')
  } finally {
    submitting.value = false
  }
}

async function submitStock() {
  submitting.value = true
  try {
    const res = await api<{ pool: Pool; batch: FishBatch }>(`/api/v1/management/pools/${stockForm.pool_id}/stock`, {
      method: 'POST',
      body: JSON.stringify(stockForm),
    })
    selectedPoolId.value = res.pool.id
    showReceipt(
      'success',
      '投苗成功',
      `${res.batch.batch_code} 已投放 ${res.batch.quantity.toLocaleString()} 尾，${res.pool.pool_code} 当前 ${res.pool.fish_count.toLocaleString()} 尾。`,
    )
    await loadAll()
  } catch (err) {
    showReceipt('error', '投苗失败', err instanceof Error ? err.message : '未知错误')
  } finally {
    submitting.value = false
  }
}

async function deletePool(pool: Pool) {
  if (pool.fish_count > 0) {
    showReceipt('error', '不能删除', '该池仍有存池鱼，请先完成出鱼或清池。')
    return
  }
  submitting.value = true
  try {
    await api(`/api/v1/management/pools/${pool.id}`, { method: 'DELETE' })
    showReceipt('success', '池子已删除', `${pool.pool_code} 已从后端资产库删除。`)
    selectedPoolId.value = ''
    await loadAll()
  } catch (err) {
    showReceipt('error', '删除失败', err instanceof Error ? err.message : '未知错误')
  } finally {
    submitting.value = false
  }
}

function showReceipt(kind: string, title: string, body: string) {
  lastReceipt.kind = kind
  lastReceipt.title = title
  lastReceipt.body = body
}

function nextPoolCode() {
  const nums = pools.value
    .map(pool => Number(pool.pool_code.replace(/\D/g, '')))
    .filter(num => Number.isFinite(num))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `P${next.toString().padStart(2, '0')}`
}

function density(pool: Pool) {
  if (!pool.area_sqm) return '0'
  return Math.round((pool.fish_count / pool.area_sqm) * 10) / 10
}

function statusText(status: PoolStatus) {
  const labels: Record<PoolStatus, string> = {
    active: '运行中',
    maintenance: '维护中',
    idle: '空闲',
  }
  return labels[status]
}

function requestStatusText(request: FieldRequest) {
  const labels: Record<FieldRequest['status'], string> = {
    waiting_review: '待处理',
    approved: '已同意',
    rejected: '已驳回',
    completed: '已完成',
  }
  return request.status_label || labels[request.status]
}

function poolCodeOf(poolId: string) {
  return pools.value.find(pool => pool.id === poolId)?.pool_code || poolId
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(loadAll)
</script>

<style scoped>
.asset-layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 356px;
  gap: 14px;
  padding: 14px;
  overflow: hidden;
  background: var(--bg-primary);
}

.asset-main,
.asset-side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.asset-side {
  overflow-y: auto;
}

.scope-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #ffffff;
  color: var(--text-secondary);
  font-size: 12px;
}

.scope-strip span {
  color: var(--accent-blue);
  font-weight: 650;
}

.scope-strip strong {
  color: var(--text-primary);
  font-weight: 600;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-card {
  min-height: 78px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #ffffff;
}

.summary-label,
.summary-sub,
.panel-hint,
.batch-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.summary-card strong {
  display: block;
  margin-top: 4px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 26px;
  line-height: 1.1;
}

.table-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.review-panel {
  flex-shrink: 0;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.review-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #ffffff;
}

.review-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.review-title strong {
  color: var(--text-primary);
}

.review-meta,
.review-reason,
.review-message,
.review-empty,
.review-done {
  color: var(--text-secondary);
  font-size: 12px;
}

.review-reason,
.review-message {
  margin-top: 4px;
}

.review-message {
  color: var(--text-primary);
}

.review-empty {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: var(--bg-muted);
}

.review-action-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-action-box textarea {
  width: 100%;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  resize: vertical;
  outline: none;
  color: var(--text-primary);
}

.review-action-box textarea:focus {
  border-color: var(--accent-blue);
}

.review-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.request-status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: #ffffff;
}

.request-status.waiting_review {
  color: var(--accent-orange);
  border-color: #e7c5a6;
  background: var(--accent-orange-dim);
}

.request-status.approved {
  color: var(--accent-blue);
  border-color: #bfd6df;
  background: var(--accent-blue-dim);
}

.request-status.rejected {
  color: var(--accent-red);
  border-color: #e3b7b4;
  background: var(--accent-red-dim);
}

.request-status.completed {
  color: var(--accent-green);
  border-color: #b9d7c6;
  background: var(--accent-green-dim);
}

.panel-actions,
.form-actions,
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-wrap {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.asset-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.asset-table th,
.asset-table td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  white-space: nowrap;
}

.asset-table th {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 650;
  background: var(--bg-muted);
}

.asset-table tr {
  cursor: pointer;
}

.asset-table tbody tr:hover,
.asset-table tbody tr.selected {
  background: var(--accent-blue-dim);
}

.pool-code,
.mono,
.batch-code,
.batch-stat strong {
  font-family: var(--font-mono);
}

.pool-code,
.batch-code {
  color: var(--accent-blue);
  font-weight: 700;
}

.status-pill {
  display: inline-flex;
  min-width: 52px;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--border-color);
  background: #ffffff;
}

.status-pill.active {
  color: var(--accent-green);
  border-color: #b9d7c6;
  background: var(--accent-green-dim);
}

.status-pill.maintenance {
  color: var(--accent-orange);
  border-color: #e7c5a6;
  background: var(--accent-orange-dim);
}

.status-pill.idle {
  color: var(--text-secondary);
}

.asset-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #ffffff;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}

.asset-btn.primary {
  color: #ffffff;
  border-color: var(--accent-blue);
  background: var(--accent-blue);
  font-weight: 650;
}

.asset-btn.danger-outline {
  color: var(--accent-red);
  border-color: #e3b7b4;
  background: #ffffff;
}

.asset-btn.secondary:hover,
.text-action:hover {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
}

.asset-btn:disabled,
.text-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.asset-btn.wide {
  width: 100%;
}

.text-action {
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}

.text-action.danger {
  color: var(--accent-red);
}

.form-panel {
  flex-shrink: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.form-grid label.full {
  grid-column: 1 / -1;
}

.form-grid input,
.form-grid select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #ffffff;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s, background-color 0.15s;
}

.form-grid input:focus,
.form-grid select:focus {
  border-color: var(--accent-blue);
  background: #fbfdff;
}

.form-grid option {
  background: #ffffff;
}

.form-actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.side-label,
.batch-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  background: var(--bg-muted);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 2px 8px;
}

.side-label.green {
  color: var(--accent-green);
  background: var(--accent-green-dim);
  border-color: #b9d7c6;
}

.side-label.blue {
  color: var(--accent-blue);
  background: var(--accent-blue-dim);
  border-color: #bfd6df;
}

.batch-panel {
  max-height: 240px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.batch-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.batch-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px 80px 64px;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #ffffff;
}

.batch-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.batch-stat span,
.batch-date {
  color: var(--text-secondary);
  font-size: 11px;
}

.receipt {
  min-height: 86px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-muted);
}

.receipt.success {
  border-color: #b9d7c6;
  background: var(--accent-green-dim);
}

.receipt.error {
  border-color: #e3b7b4;
  background: var(--accent-red-dim);
}

.receipt-title {
  color: var(--text-primary);
  font-weight: 700;
  margin-bottom: 6px;
}

.receipt-body {
  color: var(--text-secondary);
  font-size: 13px;
}

.mono {
  color: var(--text-primary);
}

@media (max-width: 1100px) {
  .asset-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .asset-side {
    overflow: visible;
  }

  .review-row {
    grid-template-columns: 1fr;
  }
}
</style>

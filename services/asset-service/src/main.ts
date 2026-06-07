/**
 * asset-service — AquaIntelligence 资产管理服务
 *
 * 启动: npm run dev   (port 3005)
 */

import express, { Request, Response } from 'express'
import cors from 'cors'
import { AssetStore, FishBatch, Pool } from './asset-store'
import { FieldStore } from './field-store'

const PORT = parseInt(process.env.PORT || '3005', 10)

const store = new AssetStore()
const fieldStore = new FieldStore()
type Role = 'admin' | 'manager' | 'operator' | 'analyst' | 'ops'

interface RequestContext {
  username: string
  role: Role
  allowedBases: string[]
}

interface Account {
  username: string
  password: string
  name: string
  role: Role
  roleLabel: string
  title: string
  department: string
  scopeLabel: string
  allowedBases: string[]
  homePath: string
  permissions: string[]
}

const accounts: Account[] = [
  {
    username: 'admin',
    password: 'admin123',
    name: '翁晨昊',
    role: 'admin',
    roleLabel: '企业管理员',
    title: '数字化负责人',
    department: '总部管理部',
    scopeLabel: '全部基地与系统配置',
    allowedBases: ['A基地', 'B基地', 'C基地'],
    homePath: '/assets',
    permissions: ['asset:read', 'asset:write', 'asset:delete', 'report:read', 'trend:read', 'ops:read', 'production:read', 'mobile:read'],
  },
  {
    username: 'manager',
    password: 'manager123',
    name: '周慧',
    role: 'manager',
    roleLabel: '养殖部经理',
    title: '生产经理',
    department: '养殖生产部',
    scopeLabel: 'A/B 基地生产与资产',
    allowedBases: ['A基地', 'B基地'],
    homePath: '/',
    permissions: ['asset:read', 'asset:write', 'report:read', 'trend:read', 'production:read'],
  },
  {
    username: 'operator',
    password: 'operator123',
    name: '王涵哲',
    role: 'operator',
    roleLabel: '现场巡检',
    title: 'A基地班组长',
    department: 'A基地现场班组',
    scopeLabel: 'A基地当班池塘',
    allowedBases: ['A基地'],
    homePath: '/mobile',
    permissions: ['production:read', 'mobile:read'],
  },
  {
    username: 'analyst',
    password: 'analyst123',
    name: '陈鹏翔',
    role: 'analyst',
    roleLabel: '经营分析',
    title: '经营分析师',
    department: '经营分析部',
    scopeLabel: '经营报表与趋势数据',
    allowedBases: ['A基地', 'B基地', 'C基地'],
    homePath: '/ceo',
    permissions: ['report:read', 'trend:read'],
  },
  {
    username: 'ops',
    password: 'ops123',
    name: '赵杰瑞',
    role: 'ops',
    roleLabel: '平台运维',
    title: '平台运维工程师',
    department: '信息技术部',
    scopeLabel: '服务状态与链路监控',
    allowedBases: [],
    homePath: '/observability',
    permissions: ['ops:read'],
  },
]

function ok(res: Response, data: unknown): void {
  res.json(data)
}

function fail(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'unknown error'
  const status = message.includes('not found') ? 404 : 400
  res.status(status).json({ error: message })
}

function getContext(req: Request): RequestContext | null {
  const role = String(req.header('X-Demo-Role') || '').trim() as Role
  const username = String(req.header('X-Demo-User') || '').trim()
  const authorization = String(req.header('Authorization') || '')
  const allowedBases = String(req.header('X-Demo-Bases') || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  if (!username || authorization !== `Bearer demo-${username}` || !['admin', 'manager', 'operator', 'analyst', 'ops'].includes(role)) {
    return null
  }

  return { username, role, allowedBases }
}

function publicUser(account: Account) {
  const { password: _password, ...user } = account
  return user
}

function requireContext(req: Request, res: Response, roles: Role[]): RequestContext | null {
  const ctx = getContext(req)
  if (!ctx) {
    res.status(401).json({ error: 'login required' })
    return null
  }
  if (!roles.includes(ctx.role)) {
    res.status(403).json({ error: `permission denied for role ${ctx.role}` })
    return null
  }
  return ctx
}

function canAccessBase(ctx: RequestContext, baseName: string): boolean {
  const normalized = normalizeBaseName(baseName)
  const baseCode = normalized.replace('基地', '')
  return ctx.allowedBases.includes(normalized) || ctx.allowedBases.includes(baseCode)
}

function scopedPools(ctx: RequestContext): Pool[] {
  return store.listPools().filter(pool => canAccessBase(ctx, pool.base_name))
}

function scopedBatches(ctx: RequestContext, poolId?: string): FishBatch[] {
  const poolIds = new Set(scopedPools(ctx).map(pool => pool.id))
  return store.listBatches(poolId).filter(batch => poolIds.has(batch.pool_id))
}

function scopedSummary(ctx: RequestContext) {
  const pools = scopedPools(ctx)
  const poolIds = new Set(pools.map(pool => pool.id))
  const batches = store.listBatches().filter(batch => poolIds.has(batch.pool_id))
  const totalFish = pools.reduce((sum, pool) => sum + pool.fish_count, 0)
  const activePools = pools.filter(pool => pool.status === 'active').length
  const activeBatches = batches.filter(batch => batch.status === 'active').length
  const totalArea = pools.reduce((sum, pool) => sum + pool.area_sqm, 0)

  return {
    total_pools: pools.length,
    active_pools: activePools,
    total_fish: totalFish,
    active_batches: activeBatches,
    total_area_sqm: round(totalArea),
    avg_density_per_sqm: totalArea > 0 ? round(totalFish / totalArea) : 0,
    updated_at: Date.now(),
  }
}

function scopedProductionPools(ctx: RequestContext) {
  const pools = scopedPools(ctx)
  const batches = scopedBatches(ctx)

  return pools.map(pool => {
    const poolBatches = batches.filter(batch => batch.pool_id === pool.id)
    const activeBatches = poolBatches.filter(batch => batch.status === 'active')
    const latestBatch = poolBatches[0] || null
    const biomassKg = activeBatches.reduce((sum, batch) => sum + batch.quantity * batch.avg_weight_kg, 0)

    return {
      ...pool,
      density_per_sqm: pool.area_sqm > 0 ? round(pool.fish_count / pool.area_sqm) : 0,
      active_batch_count: activeBatches.length,
      biomass_kg: round(biomassKg),
      latest_batch: latestBatch,
    }
  })
}

function requirePoolAccess(req: Request, res: Response, ctx: RequestContext): Pool | null {
  const pool = store.getPool(req.params.id)
  if (!pool) {
    res.status(404).json({ error: 'pool not found' })
    return null
  }
  if (!canAccessBase(ctx, pool.base_name)) {
    res.status(403).json({ error: `base ${pool.base_name} is outside current role scope` })
    return null
  }
  return pool
}

function requireBaseAccess(res: Response, ctx: RequestContext, baseName: string): boolean {
  const normalized = normalizeBaseName(baseName)
  if (canAccessBase(ctx, normalized)) return true
  res.status(403).json({ error: `base ${normalized} is outside current role scope` })
  return false
}

function normalizeBaseName(value: unknown): string {
  const text = String(value || '').trim()
  const code = text.match(/^[ABC]/i)?.[0]?.toUpperCase()
  if (code) return `${code}基地`
  return text
}

function scopedBaseNames(ctx: RequestContext): string[] {
  const pools = scopedPools(ctx)
  return Array.from(new Set(pools.map(pool => pool.base_name)))
}

function requireBodyBaseAccess(req: Request, res: Response, ctx: RequestContext): boolean {
  const baseName = String(req.body?.base_name || '').trim()
  if (!baseName) {
    res.status(400).json({ error: 'base_name is required' })
    return false
  }
  return requireBaseAccess(res, ctx, baseName)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

async function main() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ service: 'asset-service', status: 'ok' })
  })

  app.post('/api/v1/auth/login', (req: Request, res: Response) => {
    const username = String(req.body?.username || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const account = accounts.find(item => item.username === username && item.password === password)
    if (!account) {
      res.status(401).json({ error: 'invalid username or password' })
      return
    }

    ok(res, {
      token: `demo-${account.username}`,
      user: publicUser(account),
    })
  })

  app.get('/api/v1/management/summary', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager', 'analyst'])
    if (!ctx) return
    ok(res, scopedSummary(ctx))
  })

  app.get('/api/v1/management/pools', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager', 'analyst'])
    if (!ctx) return
    const pools = scopedPools(ctx)
    ok(res, { total: pools.length, pools })
  })

  app.post('/api/v1/management/pools', (req: Request, res: Response) => {
    const ctx = requireContext(req, res, ['admin', 'manager'])
    if (!ctx) return
    const baseName = normalizeBaseName(req.body?.base_name || 'A基地')
    if (!requireBaseAccess(res, ctx, baseName)) return
    req.body.base_name = baseName
    try {
      ok(res, { pool: store.createPool(req.body) })
    } catch (err) {
      fail(res, err)
    }
  })

  app.get('/api/v1/management/pools/:id', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager', 'analyst'])
    if (!ctx) return
    const pool = requirePoolAccess(req, res, ctx)
    if (!pool) return
    ok(res, { pool })
  })

  app.put('/api/v1/management/pools/:id', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager'])
    if (!ctx) return
    const pool = requirePoolAccess(req, res, ctx)
    if (!pool) return
    const nextBase = normalizeBaseName(req.body?.base_name || pool.base_name)
    if (!requireBaseAccess(res, ctx, nextBase)) return
    req.body.base_name = nextBase
    try {
      ok(res, { pool: store.updatePool(req.params.id, req.body) })
    } catch (err) {
      fail(res, err)
    }
  })

  app.delete('/api/v1/management/pools/:id', (req, res) => {
    const ctx = requireContext(req, res, ['admin'])
    if (!ctx) return
    const pool = requirePoolAccess(req, res, ctx)
    if (!pool) return
    try {
      ok(res, { deleted: true, pool: store.deletePool(req.params.id) })
    } catch (err) {
      fail(res, err)
    }
  })

  app.post('/api/v1/management/pools/:id/stock', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager'])
    if (!ctx) return
    const pool = requirePoolAccess(req, res, ctx)
    if (!pool) return
    try {
      ok(res, store.stockFish(req.params.id, req.body))
    } catch (err) {
      fail(res, err)
    }
  })

  app.get('/api/v1/management/batches', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager', 'analyst'])
    if (!ctx) return
    const poolId = req.query.pool_id as string | undefined
    const batches = scopedBatches(ctx, poolId)
    ok(res, { total: batches.length, batches })
  })

  app.get('/api/v1/production/summary', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager', 'operator', 'analyst'])
    if (!ctx) return
    ok(res, scopedSummary(ctx))
  })

  app.get('/api/v1/production/pools', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager', 'operator', 'analyst'])
    if (!ctx) return
    const pools = scopedProductionPools(ctx)
    ok(res, {
      total: pools.length,
      summary: scopedSummary(ctx),
      pools,
    })
  })

  app.post('/api/v1/management/batches/:id/harvest', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager'])
    if (!ctx) return
    const batch = store.listBatches().find(item => item.id === req.params.id || item.batch_code === req.params.id)
    if (!batch) {
      res.status(404).json({ error: 'batch not found' })
      return
    }
    const pool = store.getPool(batch.pool_id)
    if (!pool || !canAccessBase(ctx, pool.base_name)) {
      res.status(403).json({ error: 'batch is outside current role scope' })
      return
    }
    try {
      ok(res, store.harvestBatch(req.params.id, req.body.quantity))
    } catch (err) {
      fail(res, err)
    }
  })

  app.get('/api/v1/field/tasks', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'operator'])
    if (!ctx) return
    ok(res, { tasks: fieldStore.listTasks(scopedBaseNames(ctx)) })
  })

  app.patch('/api/v1/field/tasks/:id/complete', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'operator'])
    if (!ctx) return
    const existing = fieldStore.getTask(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'inspection task not found' })
      return
    }
    if (!canAccessBase(ctx, existing.base_name)) {
      res.status(403).json({ error: 'task is outside current role scope' })
      return
    }
    try {
      const task = fieldStore.completeTask(req.params.id, ctx, req.body?.note)
      ok(res, { task })
    } catch (err) {
      fail(res, err)
    }
  })

  app.get('/api/v1/field/work-orders', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager', 'operator'])
    if (!ctx) return
    ok(res, { work_orders: fieldStore.listWorkOrders(scopedBaseNames(ctx)) })
  })

  app.post('/api/v1/field/work-orders', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'operator'])
    if (!ctx) return
    req.body.base_name = normalizeBaseName(req.body?.base_name)
    if (!requireBodyBaseAccess(req, res, ctx)) return
    try {
      ok(res, { work_order: fieldStore.createWorkOrder(req.body, ctx) })
    } catch (err) {
      fail(res, err)
    }
  })

  app.patch('/api/v1/field/work-orders/:id/review', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'manager'])
    if (!ctx) return
    const existing = fieldStore.getWorkOrder(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'work order not found' })
      return
    }
    if (!canAccessBase(ctx, existing.base_name)) {
      res.status(403).json({ error: 'work order is outside current role scope' })
      return
    }
    try {
      const status = req.body?.status === 'rejected' ? 'rejected' : 'approved'
      const order = fieldStore.reviewWorkOrder(req.params.id, status, ctx, req.body?.note)
      ok(res, { work_order: order })
    } catch (err) {
      fail(res, err)
    }
  })

  app.patch('/api/v1/field/work-orders/:id/complete', (req, res) => {
    const ctx = requireContext(req, res, ['admin', 'operator'])
    if (!ctx) return
    const existing = fieldStore.getWorkOrder(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'work order not found' })
      return
    }
    if (!canAccessBase(ctx, existing.base_name)) {
      res.status(403).json({ error: 'work order is outside current role scope' })
      return
    }
    try {
      const order = fieldStore.completeWorkOrder(req.params.id, ctx, req.body?.note)
      ok(res, { work_order: order })
    } catch (err) {
      fail(res, err)
    }
  })

  const server = app.listen(PORT, () => {
    console.log(`[asset-service] listening on port ${PORT}`)
    console.log('[asset-service] GET  /api/v1/management/pools')
    console.log('[asset-service] POST /api/v1/management/pools/:id/stock')
    console.log('[asset-service] GET  /api/v1/production/pools')
    console.log('[asset-service] GET  /api/v1/field/work-orders')
  })

  const shutdown = (signal: string) => {
    console.log(`\n[asset-service] received ${signal}, shutting down...`)
    server.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()

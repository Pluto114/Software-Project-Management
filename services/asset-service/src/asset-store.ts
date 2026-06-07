import fs from 'fs'
import path from 'path'

export type PoolStatus = 'active' | 'maintenance' | 'idle'
export type BatchStatus = 'active' | 'harvested'

export interface Pool {
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

export interface FishBatch {
  id: string
  pool_id: string
  batch_code: string
  breed: string
  quantity: number
  avg_weight_kg: number
  source: string
  stocked_at: number
  status: BatchStatus
  note: string
}

interface AssetData {
  pools: Pool[]
  fish_batches: FishBatch[]
}

interface PoolInput {
  pool_code?: string
  base_name?: string
  breed?: string
  area_sqm?: number
  water_depth_m?: number
  status?: PoolStatus
  manager?: string
}

interface StockInput {
  breed?: string
  quantity?: number
  avg_weight_kg?: number
  source?: string
  stocked_at?: number
  note?: string
}

const DATA_PATH = process.env.ASSET_DATA_PATH ||
  path.resolve(process.cwd(), '..', '..', '.local', 'asset-data.json')

export class AssetStore {
  private data: AssetData

  constructor() {
    this.data = this.load()
  }

  getSummary() {
    const totalFish = this.data.pools.reduce((sum, pool) => sum + pool.fish_count, 0)
    const activePools = this.data.pools.filter(pool => pool.status === 'active').length
    const activeBatches = this.data.fish_batches.filter(batch => batch.status === 'active').length
    const totalArea = this.data.pools.reduce((sum, pool) => sum + pool.area_sqm, 0)

    return {
      total_pools: this.data.pools.length,
      active_pools: activePools,
      total_fish: totalFish,
      active_batches: activeBatches,
      total_area_sqm: round(totalArea),
      avg_density_per_sqm: totalArea > 0 ? round(totalFish / totalArea) : 0,
      updated_at: Date.now(),
    }
  }

  listPools(): Pool[] {
    return [...this.data.pools].sort((a, b) => a.pool_code.localeCompare(b.pool_code))
  }

  getPool(id: string): Pool | null {
    return this.data.pools.find(pool => pool.id === id || pool.pool_code === id) || null
  }

  createPool(input: PoolInput): Pool {
    const poolCode = cleanString(input.pool_code).toUpperCase()
    if (!poolCode) throw new Error('pool_code is required')
    if (this.data.pools.some(pool => pool.pool_code === poolCode)) {
      throw new Error(`pool_code ${poolCode} already exists`)
    }

    const now = Date.now()
    const pool: Pool = {
      id: makeId('pool'),
      pool_code: poolCode,
      base_name: cleanString(input.base_name) || 'A基地',
      breed: cleanString(input.breed) || '待投放',
      fish_count: 0,
      area_sqm: positiveNumber(input.area_sqm, 500),
      water_depth_m: positiveNumber(input.water_depth_m, 1.6),
      status: input.status || 'idle',
      manager: cleanString(input.manager) || '未分配',
      created_at: now,
      updated_at: now,
    }

    this.data.pools.push(pool)
    this.save()
    return pool
  }

  updatePool(id: string, input: PoolInput): Pool {
    const pool = this.getPool(id)
    if (!pool) throw new Error('pool not found')

    const nextCode = input.pool_code ? cleanString(input.pool_code).toUpperCase() : pool.pool_code
    if (!nextCode) throw new Error('pool_code is required')
    if (nextCode !== pool.pool_code && this.data.pools.some(item => item.pool_code === nextCode)) {
      throw new Error(`pool_code ${nextCode} already exists`)
    }

    pool.pool_code = nextCode
    pool.base_name = cleanString(input.base_name) || pool.base_name
    pool.breed = cleanString(input.breed) || pool.breed
    pool.area_sqm = positiveNumber(input.area_sqm, pool.area_sqm)
    pool.water_depth_m = positiveNumber(input.water_depth_m, pool.water_depth_m)
    pool.status = input.status || pool.status
    pool.manager = cleanString(input.manager) || pool.manager
    pool.updated_at = Date.now()

    this.save()
    return pool
  }

  deletePool(id: string): Pool {
    const index = this.data.pools.findIndex(pool => pool.id === id || pool.pool_code === id)
    if (index < 0) throw new Error('pool not found')

    const pool = this.data.pools[index]
    if (pool.fish_count > 0) {
      throw new Error('cannot delete pool with active fish stock')
    }

    this.data.pools.splice(index, 1)
    this.data.fish_batches = this.data.fish_batches.filter(batch => batch.pool_id !== pool.id)
    this.save()
    return pool
  }

  stockFish(poolId: string, input: StockInput): { pool: Pool; batch: FishBatch } {
    const pool = this.getPool(poolId)
    if (!pool) throw new Error('pool not found')

    const quantity = Math.floor(positiveNumber(input.quantity, 0))
    if (quantity <= 0) throw new Error('quantity must be greater than 0')

    const now = Date.now()
    const batch: FishBatch = {
      id: makeId('batch'),
      pool_id: pool.id,
      batch_code: `FB-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      breed: cleanString(input.breed) || pool.breed || '未命名鱼种',
      quantity,
      avg_weight_kg: positiveNumber(input.avg_weight_kg, 0.02),
      source: cleanString(input.source) || '本地苗场',
      stocked_at: input.stocked_at || now,
      status: 'active',
      note: cleanString(input.note),
    }

    pool.fish_count += quantity
    pool.breed = batch.breed
    pool.status = 'active'
    pool.updated_at = now
    this.data.fish_batches.unshift(batch)
    this.save()

    return { pool, batch }
  }

  listBatches(poolId?: string): FishBatch[] {
    return this.data.fish_batches
      .filter(batch => !poolId || batch.pool_id === poolId)
      .sort((a, b) => b.stocked_at - a.stocked_at)
  }

  harvestBatch(batchId: string, quantity?: number): { pool: Pool; batch: FishBatch; harvested_quantity: number } {
    const batch = this.data.fish_batches.find(item => item.id === batchId || item.batch_code === batchId)
    if (!batch) throw new Error('batch not found')
    if (batch.status === 'harvested') throw new Error('batch already harvested')

    const pool = this.getPool(batch.pool_id)
    if (!pool) throw new Error('pool not found')

    const harvested = Math.min(Math.floor(positiveNumber(quantity, batch.quantity)), batch.quantity)
    batch.quantity -= harvested
    pool.fish_count = Math.max(0, pool.fish_count - harvested)
    pool.updated_at = Date.now()

    if (batch.quantity === 0) {
      batch.status = 'harvested'
    }
    if (pool.fish_count === 0) {
      pool.status = 'idle'
    }

    this.save()
    return { pool, batch, harvested_quantity: harvested }
  }

  private load(): AssetData {
    if (!fs.existsSync(DATA_PATH)) {
      const seed = seedData()
      this.write(seed)
      return seed
    }

    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8')
      return JSON.parse(raw) as AssetData
    } catch {
      const seed = seedData()
      this.write(seed)
      return seed
    }
  }

  private save(): void {
    this.write(this.data)
  }

  private write(data: AssetData): void {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true })
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
  }
}

function seedData(): AssetData {
  const now = Date.now()
  const pools: Pool[] = [
    seedPool('P01', 'A基地', '石斑鱼', 12000, 500, 'active', '王涵哲', now - 86400_000 * 30),
    seedPool('P02', 'A基地', '石斑鱼', 10500, 500, 'active', '王涵哲', now - 86400_000 * 28),
    seedPool('P03', 'A基地', '珍珠龙胆', 8000, 500, 'active', '赵杰瑞', now - 86400_000 * 24),
    seedPool('P04', 'B基地', '东星斑', 15000, 650, 'active', '陈鹏翔', now - 86400_000 * 26),
    seedPool('P05', 'B基地', '老虎斑', 9200, 650, 'active', '陈鹏翔', now - 86400_000 * 20),
  ]

  return {
    pools,
    fish_batches: pools.map(pool => ({
      id: makeId('batch'),
      pool_id: pool.id,
      batch_code: `FB-${pool.pool_code}-INIT`,
      breed: pool.breed,
      quantity: pool.fish_count,
      avg_weight_kg: 0.18,
      source: '课程演示种苗库',
      stocked_at: pool.created_at,
      status: 'active',
      note: '初始化演示批次',
    })),
  }
}

function seedPool(
  code: string,
  baseName: string,
  breed: string,
  fishCount: number,
  area: number,
  status: PoolStatus,
  manager: string,
  createdAt: number,
): Pool {
  return {
    id: makeId('pool'),
    pool_code: code,
    base_name: baseName,
    breed,
    fish_count: fishCount,
    area_sqm: area,
    water_depth_m: 1.6,
    status,
    manager,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

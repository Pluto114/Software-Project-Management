/**
 * 数据接入模块 — Redis Pub/Sub 消费 → 清洗 → InfluxDB 批量写入
 *
 * 清洗管线: 值域校验 → 中值滤波(win=5) → 3σ 剔除 → 写入
 */

import Redis from 'ioredis'
import { InfluxDB, Point } from '@influxdata/influxdb-client'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086'
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'aqua_dev_token_2024'
const INFLUX_ORG = process.env.INFLUX_ORG || 'aqua-intelligence'
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'sensor_telemetry'

const BATCH_SIZE = 5000
const FLUSH_INTERVAL_MS = 1000

/** 传感器值域白名单 */
const SENSOR_RANGES: Record<string, [number, number]> = {
  DO: [0, 20],
  pH: [0, 14],
  TEMP: [0, 50],
  NH3N: [0, 2],
  COND: [0, 10],
  ORP: [0, 600],
}

export class DataIngest {
  private redis: Redis
  private influx: InfluxDB
  private writeApi: ReturnType<InfluxDB['getWriteApi']>
  private batch: string[] = []
  // 中值滤波窗口: sensorId → values[]
  private medianWindows = new Map<string, number[]>()
  // 统计窗口: sensorId → { sum, sum2, count } (for 3σ)
  private statsWindows = new Map<string, { sum: number; sum2: number; count: number }>()
  private running = false

  constructor() {
    this.redis = new Redis(REDIS_URL)
    this.influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })
    this.writeApi = this.influx.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ms')
  }

  async start(): Promise<void> {
    this.running = true

    // Redis Pub/Sub 消费
    this.redis.subscribe('sensor_data', (err) => {
      if (err) console.error('[ingest] Redis subscribe error:', err.message)
    })

    this.redis.on('message', (channel, message) => {
      if (channel === 'sensor_data') {
        this.processMessage(message)
      }
    })

    // 定时 flush InfluxDB 批量
    const flushTimer = setInterval(() => {
      if (this.batch.length > 0) this.flush()
    }, FLUSH_INTERVAL_MS)

    // 确保退出时 flush
    process.on('SIGTERM', () => {
      clearInterval(flushTimer)
      this.flush()
    })

    console.log('[ingest] subscribed to Redis channel: sensor_data')
  }

  async stop(): Promise<void> {
    this.running = false
    this.flush()
    await this.writeApi.close()
    this.redis.disconnect()
  }

  /** 处理单条 sensor 消息 */
  private async processMessage(raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw)
      const { pool_id, sensor_type, value, unit, ts } = msg

      // 1. 值域校验
      const range = SENSOR_RANGES[sensor_type]
      if (range && (value < range[0] || value > range[1])) {
        console.warn(`[ingest] value out of range: ${sensor_type}=${value}`)
        return
      }

      // 2. 中值滤波
      const key = `${pool_id}:${sensor_type}`
      const window = this.medianWindows.get(key) || []
      window.push(value)
      if (window.length > 5) window.shift()
      this.medianWindows.set(key, window)
      const filtered = median(window)

      // 3. 3σ 异常剔除
      const stats = this.statsWindows.get(key) || { sum: 0, sum2: 0, count: 0 }
      if (stats.count >= 10) {
        const mean = stats.sum / stats.count
        const variance = stats.sum2 / stats.count - mean * mean
        const stddev = Math.sqrt(Math.max(0, variance))
        if (Math.abs(value - mean) > 3 * stddev) {
          console.warn(`[ingest] 3σ outlier: ${sensor_type}=${value} (mean=${mean.toFixed(2)}, σ=${stddev.toFixed(2)})`)
          return
        }
      }
      stats.sum += filtered
      stats.sum2 += filtered * filtered
      stats.count++
      this.statsWindows.set(key, stats)

      // 4. Redis 实时快照
      const snapshotKey = `realtime:${pool_id}:${sensor_type}`
      await this.redis.set(snapshotKey, JSON.stringify({
        value: filtered,
        unit,
        ts: ts || Date.now(),
      }))

      // 5. InfluxDB Line Protocol (批量)
      const point = new Point('sensor_reading')
        .tag('pool_id', pool_id)
        .tag('sensor_type', sensor_type)
        .floatField('value', value)
        .floatField('filtered', filtered)
        .stringField('unit', unit)
        .timestamp(ts ? new Date(ts) : new Date())

      const line = point.toLineProtocol()
      if (line) this.batch.push(line)
      if (this.batch.length >= BATCH_SIZE) {
        this.flush()
      }

    } catch {
      // 忽略无法解析的消息
    }
  }

  /** 批量写入 InfluxDB */
  private flush(): void {
    if (this.batch.length === 0) return
    const lines = this.batch.splice(0)
    try {
      this.writeApi.writeRecords(lines)
      console.log(`[ingest] flushed ${lines.length} points to InfluxDB`)
    } catch (err: any) {
      console.error('[ingest] InfluxDB write error:', err.message)
    }
  }
}

/** 中值滤波 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * 时序数据查询服务
 *
 * GET /api/v1/assets/realtime?pool_id=P01        → Redis 实时快照
 * GET /api/v1/assets/history?pool_id=P01&metric=DO&from=&to=&interval=5m  → InfluxDB
 */

import { Request, Response } from 'express'
import Redis from 'ioredis'
import { InfluxDB } from '@influxdata/influxdb-client'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086'
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'aqua_dev_token_2024'
const INFLUX_ORG = process.env.INFLUX_ORG || 'aqua-intelligence'
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'sensor_telemetry'

export class TimeseriesQuery {
  private redis: Redis
  private influx: InfluxDB

  constructor() {
    this.redis = new Redis(REDIS_URL)
    this.influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })
  }

  /** GET /api/v1/assets/realtime — 从 Redis 获取最新快照 */
  async getRealtime(req: Request, res: Response): Promise<void> {
    const poolId = (req.query.pool_id as string) || 'P01'

    const sensors = ['DO', 'pH', 'TEMP', 'NH3N', 'COND', 'ORP']
    const results: Record<string, any> = { pool_id: poolId, ts: Date.now() }

    for (const st of sensors) {
      const raw = await this.redis.get(`realtime:${poolId}:${st}`)
      if (raw) {
        results[st] = JSON.parse(raw)
      }
    }

    res.json(results)
  }

  /** GET /api/v1/assets/history — InfluxDB 历史查询 */
  async getHistory(req: Request, res: Response): Promise<void> {
    const poolId = req.query.pool_id as string || 'P01'
    const metric = req.query.metric as string || 'DO'
    const from = req.query.from as string || '-6h'
    const to = req.query.to as string || 'now()'
    const interval = req.query.interval as string || '5m'
    const limit = parseInt(req.query.limit as string || '500')

    // 时间范围解析
    const rangeStart = from.startsWith('-') ? from : from // e.g. '-6h' or ISO
    const startParam = typeof rangeStart === 'string' && rangeStart.startsWith('-') ? rangeStart : from

    // Flux 查询
    const fluxQuery = `
      from(bucket: "${INFLUX_BUCKET}")
        |> range(start: ${startParam}, stop: ${to})
        |> filter(fn: (r) => r["_measurement"] == "sensor_reading")
        |> filter(fn: (r) => r["pool_id"] == "${poolId}")
        |> filter(fn: (r) => r["sensor_type"] == "${metric}")
        |> filter(fn: (r) => r["_field"] == "filtered")
        |> aggregateWindow(every: ${interval}, fn: mean, createEmpty: false)
        |> sort(columns: ["_time"], desc: false)
        |> limit(n: ${limit})
    `

    try {
      const queryApi = this.influx.getQueryApi(INFLUX_ORG)
      const rows: { time: string; value: number }[] = []

      await new Promise<void>((resolve, reject) => {
        queryApi.queryRows(fluxQuery, {
          next(row, tableMeta) {
            const obj = tableMeta.toObject(row)
            rows.push({
              time: obj._time,
              value: obj._value,
            })
          },
          error(err) {
            reject(err)
          },
          complete() {
            resolve()
          },
        })
      })

      res.json({
        pool_id: poolId,
        metric,
        interval,
        points: rows.length,
        data: rows,
      })
    } catch (err: any) {
      console.error('[query] InfluxDB query error:', err.message)
      // 返回模拟数据作为 fallback
      res.json({
        pool_id: poolId,
        metric,
        interval,
        points: 0,
        data: [],
        error: 'InfluxDB unavailable, returning empty dataset',
      })
    }
  }

  async close(): Promise<void> {
    this.redis.disconnect()
  }
}

/**
 * 规则评估器 — 订阅 Redis 实时数据，逐条评估规则链
 *
 * 评估流水线: 阈值匹配 → 趋势分析 → 复合风险 → 风险评级 → Alert 发布
 */

import Redis from 'ioredis'
import { evaluateDO, evaluateDOTrend, evaluateCompoundRisk, RuleResult } from '../rules/do-warning.rule'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export interface SensorPayload {
  pool_id: string
  sensor_type: string
  value: number
}

export interface AlertEvent {
  id: string
  pool_id: string
  rule: string
  level: 'green' | 'yellow' | 'red'
  message: string
  sensor_type: string
  current_value: number
  threshold: number
  ts: number
  confirmed: boolean
  confirmed_at?: number
}

export class RuleEvaluator {
  private redis: Redis
  private doWindows = new Map<string, number[]>()
  // 每池最新传感器读数
  private latestReadings = new Map<string, Record<string, number>>()
  private alertHistory: AlertEvent[] = []
  private running = false

  constructor() {
    this.redis = new Redis(REDIS_URL, {
      connectTimeout: 500,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 2) return null
        return Math.min(times * 100, 500)
      },
    })
  }

  async start(): Promise<void> {
    this.running = true

    try {
      await this.redis.subscribe('sensor_data')
    } catch (err: any) {
      console.warn(`[evaluator] Redis subscribe unavailable: ${err.message}`)
    }

    this.redis.on('message', (channel, message) => {
      if (channel === 'sensor_data') {
        this.evaluate(message)
      }
    })

    console.log('[evaluator] subscribed to Redis channel: sensor_data')
  }

  async stop(): Promise<void> {
    this.running = false
    this.redis.disconnect()
  }

  /** 评估单条传感器数据 */
  private async evaluate(raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw)
      await this.evaluatePayload(msg)
    } catch {
      // 忽略无效消息
    }
  }

  /** 手动或订阅触发的规则评估 */
  async evaluatePayload(msg: SensorPayload): Promise<RuleResult[]> {
    const poolId = msg.pool_id || 'P01'
    const sensorType = msg.sensor_type
    const value = Number(msg.value)

    if (!sensorType || Number.isNaN(value)) return []

    // 更新最新读数
    const readings = this.latestReadings.get(poolId) || {}
    readings[sensorType] = value
    this.latestReadings.set(poolId, readings)

    if (sensorType !== 'DO') return []

    const results = evaluateDO(value)

    // DO 趋势窗口
    const win = this.doWindows.get(poolId) || []
    win.push(value)
    if (win.length > 30) win.shift()
    this.doWindows.set(poolId, win)

    const trendResult = evaluateDOTrend(win)
    if (trendResult) results.push(trendResult)

    // 复合风险
    const compoundResult = evaluateCompoundRisk(readings)
    if (compoundResult) results.push(compoundResult)

    for (const r of results) {
      await this.publishAlert(poolId, r)
    }

    return results
  }

  getAlerts(filters: { poolId?: string; level?: string; limit?: number } = {}): AlertEvent[] {
    const limit = filters.limit || 50
    return this.alertHistory
      .filter(alert => !filters.poolId || alert.pool_id === filters.poolId)
      .filter(alert => !filters.level || alert.level === filters.level)
      .slice(0, limit)
  }

  confirmAlert(id: string): AlertEvent | null {
    const alert = this.alertHistory.find(item => item.id === id)
    if (!alert) return null
    alert.confirmed = true
    alert.confirmed_at = Date.now()
    return alert
  }

  /** 发布告警到 Redis Pub/Sub */
  private async publishAlert(poolId: string, result: RuleResult): Promise<void> {
    const alert: AlertEvent = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      pool_id: poolId,
      rule: result.ruleName,
      level: result.level,
      message: result.message,
      sensor_type: result.sensorType,
      current_value: result.currentValue,
      threshold: result.threshold,
      ts: Date.now(),
      confirmed: false,
    }

    this.alertHistory.unshift(alert)
    if (this.alertHistory.length > 200) this.alertHistory.pop()

    try {
      await this.redis.publish('alert_event', JSON.stringify(alert))
    } catch (err: any) {
      console.warn(`[evaluator] alert publish skipped: ${err.message}`)
    }
    console.log(`[evaluator] ALERT [${result.level.toUpperCase()}] ${poolId}: ${result.message}`)
  }
}

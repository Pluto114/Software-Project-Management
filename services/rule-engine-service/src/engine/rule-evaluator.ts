/**
 * 规则评估器 — 订阅 Redis 实时数据，逐条评估规则链
 *
 * 评估流水线: 阈值匹配 → 趋势分析 → 复合风险 → 风险评级 → Alert 发布
 */

import Redis from 'ioredis'
import { evaluateDO, evaluateDOTrend, evaluateCompoundRisk, RiskLevel, RuleResult } from '../rules/do-warning.rule'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export class RuleEvaluator {
  private redis: Redis
  private doWindows = new Map<string, number[]>()
  // 每池最新传感器读数
  private latestReadings = new Map<string, Record<string, number>>()
  private running = false

  constructor() {
    this.redis = new Redis(REDIS_URL)
  }

  async start(): Promise<void> {
    this.running = true

    this.redis.subscribe('sensor_data', (err) => {
      if (err) console.error('[evaluator] Redis subscribe error:', err.message)
    })

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
      const { pool_id, sensor_type, value } = msg

      // 更新最新读数
      const readings = this.latestReadings.get(pool_id) || {}
      readings[sensor_type] = value
      this.latestReadings.set(pool_id, readings)

      // DO 阈值规则
      if (sensor_type === 'DO') {
        const results = evaluateDO(value)

        // DO 趋势窗口
        const win = this.doWindows.get(pool_id) || []
        win.push(value)
        if (win.length > 30) win.shift() // 保留最近 30 个样本
        this.doWindows.set(pool_id, win)

        const trendResult = evaluateDOTrend(win)
        if (trendResult) results.push(trendResult)

        // 复合风险
        const compoundResult = evaluateCompoundRisk(readings)
        if (compoundResult) results.push(compoundResult)

        // 发布告警到 Redis
        for (const r of results) {
          await this.publishAlert(pool_id, r)
        }
      }

    } catch {
      // 忽略无效消息
    }
  }

  /** 发布告警到 Redis Pub/Sub */
  private async publishAlert(poolId: string, result: RuleResult): Promise<void> {
    const alert = JSON.stringify({
      pool_id: poolId,
      rule: result.ruleName,
      level: result.level,
      message: result.message,
      sensor_type: result.sensorType,
      current_value: result.currentValue,
      threshold: result.threshold,
      ts: Date.now(),
    })

    await this.redis.publish('alert_event', alert)
    console.log(`[evaluator] ALERT [${result.level.toUpperCase()}] ${poolId}: ${result.message}`)
  }
}

/**
 * 消息路由服务 — 按类型分发到不同处理通道
 *
 *  0x01 telemetry  → Redis Pub/Sub channel "sensor_data"
 *  0x02 alert      → Redis Pub/Sub channel "alert_event"
 *  0x03 command    → Redis Pub/Sub channel "cmd_result"
 */

import Redis from 'ioredis'
import crypto from 'crypto'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export class MessageRouter {
  private redis: Redis | null = null
  private connected = false

  private ensureRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 5) return null
          return Math.min(times * 200, 2000)
        },
        lazyConnect: true,
      })

      this.redis.on('connect', () => {
        this.connected = true
        console.log('[router] Redis connected')
      })

      this.redis.on('error', (err) => {
        console.error('[router] Redis error:', err.message)
      })
    }
    return this.redis
  }

  /** 路由遥测数据 → Redis Pub/Sub */
  async routeTelemetry(payload: Buffer): Promise<void> {
    const traceId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
    try {
      const json = JSON.parse(payload.toString('utf-8'))
      const message = JSON.stringify({
        traceId,
        ts: Date.now(),
        ...json,
      })

      if (this.connected) {
        await this.redis!.publish('sensor_data', message)
      } else {
        console.log(`[router] telemetry (no-redis): ${message.slice(0, 120)}`)
      }
    } catch {
      console.warn('[router] invalid telemetry payload')
    }
  }

  /** 路由告警事件 → Redis Pub/Sub */
  async routeAlert(payload: Buffer): Promise<void> {
    const traceId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
    try {
      const json = JSON.parse(payload.toString('utf-8'))
      const message = JSON.stringify({
        traceId,
        ts: Date.now(),
        ...json,
      })

      if (this.connected) {
        await this.redis!.publish('alert_event', message)
      } else {
        console.log(`[router] alert (no-redis): ${message.slice(0, 120)}`)
      }
    } catch {
      console.warn('[router] invalid alert payload')
    }
  }

  /** 路由指令执行结果 → Redis Pub/Sub */
  async routeCommandResult(payload: Buffer): Promise<void> {
    const traceId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
    try {
      const json = JSON.parse(payload.toString('utf-8'))
      const message = JSON.stringify({
        traceId,
        ts: Date.now(),
        ...json,
      })

      if (this.connected) {
        await this.redis!.publish('cmd_result', message)
      } else {
        console.log(`[router] cmd_result (no-redis): ${message.slice(0, 120)}`)
      }
    } catch {
      console.warn('[router] invalid command payload')
    }
  }

  /** 关闭 Redis 连接 */
  async close(): Promise<void> {
    if (this.redis) {
      this.connected = false
      await this.redis.quit()
      this.redis = null
    }
  }
}

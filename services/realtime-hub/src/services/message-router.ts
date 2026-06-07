/**
 * 消息路由服务 — 按类型分发到不同处理通道
 *
 *  0x01 telemetry  -> Redis Pub/Sub channel "sensor_data"
 *  0x02 alert      -> Redis Pub/Sub channel "alert_event"
 *  0x03 command    -> Redis Pub/Sub channel "control_command"
 *  0x03 result     -> Redis Pub/Sub channel "cmd_result"
 */

import Redis from 'ioredis'
import crypto from 'crypto'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

const CHANNEL_FRAME_TYPES: Record<string, number> = {
  sensor_data: 0x01,
  alert_event: 0x02,
  control_command: 0x03,
  cmd_result: 0x03,
}

export type OutboundMessageHandler = (channel: string, frameType: number, payload: Buffer) => void

export class MessageRouter {
  private publisher: Redis | null = null
  private subscriber: Redis | null = null

  private createRedisClient(role: string): Redis {
    const client = new Redis(REDIS_URL, {
      connectTimeout: 500,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 2) return null
        return Math.min(times * 200, 2000)
      },
      lazyConnect: true,
    })

    client.on('connect', () => {
      console.log(`[router] Redis ${role} connected`)
    })

    client.on('error', (err) => {
      console.error(`[router] Redis ${role} error:`, err.message)
    })

    return client
  }

  private ensurePublisher(): Redis {
    if (!this.publisher) {
      this.publisher = this.createRedisClient('publisher')
    }
    return this.publisher
  }

  private ensureSubscriber(): Redis {
    if (!this.subscriber) {
      this.subscriber = this.createRedisClient('subscriber')
    }
    return this.subscriber
  }

  async startOutbound(handler: OutboundMessageHandler): Promise<void> {
    const subscriber = this.ensureSubscriber()
    if (subscriber.status === 'wait') {
      await subscriber.connect()
    }

    const channels = Object.keys(CHANNEL_FRAME_TYPES)
    await subscriber.subscribe(...channels)
    subscriber.on('message', (channel, message) => {
      const frameType = CHANNEL_FRAME_TYPES[channel]
      if (!frameType) return
      handler(channel, frameType, Buffer.from(message, 'utf-8'))
    })

    console.log(`[router] outbound bridge subscribed: ${channels.join(', ')}`)
  }

  private async publish(channel: string, message: string): Promise<boolean> {
    try {
      const publisher = this.ensurePublisher()
      if (publisher.status === 'wait') {
        await publisher.connect()
      }
      await publisher.publish(channel, message)
      return true
    } catch (err: any) {
      console.warn(`[router] ${channel} publish skipped: ${err.message}`)
      return false
    }
  }

  /** 路由遥测数据 → Redis Pub/Sub */
  async routeTelemetry(payload: Buffer): Promise<boolean> {
    const traceId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
    try {
      const json = JSON.parse(payload.toString('utf-8'))
      const message = JSON.stringify({
        traceId,
        ts: Date.now(),
        ...json,
      })

      return this.publish('sensor_data', message)
    } catch {
      console.warn('[router] invalid telemetry payload')
      return false
    }
  }

  /** 路由告警事件 → Redis Pub/Sub */
  async routeAlert(payload: Buffer): Promise<boolean> {
    const traceId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
    try {
      const json = JSON.parse(payload.toString('utf-8'))
      const message = JSON.stringify({
        traceId,
        ts: Date.now(),
        ...json,
      })

      return this.publish('alert_event', message)
    } catch {
      console.warn('[router] invalid alert payload')
      return false
    }
  }

  /** 路由指令执行结果 → Redis Pub/Sub */
  async routeCommandResult(payload: Buffer): Promise<boolean> {
    const traceId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
    try {
      const json = JSON.parse(payload.toString('utf-8'))
      const message = JSON.stringify({
        traceId,
        ts: Date.now(),
        ...json,
      })

      return this.publish('cmd_result', message)
    } catch {
      console.warn('[router] invalid command payload')
      return false
    }
  }

  /** 关闭 Redis 连接 */
  async close(): Promise<void> {
    const clients = [this.publisher, this.subscriber].filter(Boolean) as Redis[]
    for (const client of clients) {
      if (client.status !== 'end') {
        await client.quit()
      }
    }
    this.publisher = null
    this.subscriber = null
  }
}

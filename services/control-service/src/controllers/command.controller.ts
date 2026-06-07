/**
 * 指令下发控制器
 *
 * POST /api/v1/control/command  — 下发 HMAC 签名控制指令
 * GET  /api/v1/control/status   — 查询指令执行状态
 */

import { Request, Response } from 'express'
import Redis from 'ioredis'
import { SignerService } from '../services/signer.service'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// 指令类型
const CMD_AERATOR_ON = 0x10
const CMD_AERATOR_OFF = 0x11
const CMD_AERATOR_FREQ = 0x12
const CMD_FEEDER_START = 0x20
const CMD_FEEDER_STOP = 0x21
const CMD_PUMP_ON = 0x30
const CMD_PUMP_OFF = 0x31
const CMD_EMERGENCY_STOP = 0xFF

const CMD_NAMES: Record<number, string> = {
  [CMD_AERATOR_ON]: 'aerator_on',
  [CMD_AERATOR_OFF]: 'aerator_off',
  [CMD_AERATOR_FREQ]: 'aerator_freq',
  [CMD_FEEDER_START]: 'feeder_start',
  [CMD_FEEDER_STOP]: 'feeder_stop',
  [CMD_PUMP_ON]: 'pump_on',
  [CMD_PUMP_OFF]: 'pump_off',
  [CMD_EMERGENCY_STOP]: 'emergency_stop',
}

interface CommandRecord {
  id: string
  deviceId: string
  command: number
  cmdName: string
  status: 'pending' | 'sent' | 'executed' | 'failed'
  nonce: string
  createdAt: number
}

const cmdHistory: CommandRecord[] = []

// 仲裁优先级: emergency_stop(0) > aerator_*(1) > feeder_*(2) > pump_*(3)
const PRIORITY: Record<number, number> = {
  [CMD_EMERGENCY_STOP]: 0,
  [CMD_AERATOR_ON]: 1, [CMD_AERATOR_OFF]: 1, [CMD_AERATOR_FREQ]: 1,
  [CMD_FEEDER_START]: 2, [CMD_FEEDER_STOP]: 2,
  [CMD_PUMP_ON]: 3, [CMD_PUMP_OFF]: 3,
}

interface PendingCommand {
  record: CommandRecord
  frame: Buffer
  timestamp: number
  priority: number
}

export class CommandController {
  private signer = new SignerService()
  private redis: Redis | null = null
  private pendingQueue: PendingCommand[] = []
  private emergencyOverride = false

  /** POST /api/v1/control/command */
  async issueCommand(req: Request, res: Response): Promise<void> {
    const { device_id, command } = req.body

    if (!device_id) {
      res.status(400).json({ error: 'missing device_id' })
      return
    }

    const cmdCode = typeof command === 'string'
      ? Object.entries(CMD_NAMES).find(([, v]) => v === command)?.[0]
      : command

    if (!cmdCode || !CMD_NAMES[Number(cmdCode)]) {
      res.status(400).json({ error: 'unknown command', available: Object.values(CMD_NAMES) })
      return
    }

    const cmdNum = Number(cmdCode)
    const priority = PRIORITY[cmdNum] ?? 9
    const payload = Buffer.from(JSON.stringify({
      device_id,
      command: CMD_NAMES[cmdNum],
      params: req.body.params || {},
    }))

    const { frame, nonce, timestamp } = this.signer.sign(device_id, cmdNum, payload)

    const record: CommandRecord = {
      id: `${Date.now().toString(36)}-${nonce.slice(0, 8)}`,
      deviceId: device_id,
      command: cmdNum,
      cmdName: CMD_NAMES[cmdNum],
      status: 'pending',
      nonce,
      createdAt: timestamp,
    }

    // 紧急停机仲裁
    if (cmdNum === CMD_EMERGENCY_STOP) {
      this.emergencyOverride = true
      // 取消所有非紧急待执行指令
      const cancelled = this.pendingQueue.filter(p => p.priority > 0)
      for (const c of cancelled) {
        c.record.status = 'failed'
        cmdHistory.push(c.record)
      }
      this.pendingQueue = this.pendingQueue.filter(p => p.priority === 0)
      console.log(`[control] EMERGENCY OVERRIDE: cancelled ${cancelled.length} pending commands`)
    }

    // 紧急模式拒绝非紧急指令
    if (this.emergencyOverride && priority > 0) {
      record.status = 'failed'
      cmdHistory.push(record)
      await this.publishCommandResult(record, device_id, priority)
      res.status(409).json({
        error: 'emergency_override_active',
        message: '紧急停机模式激活中，非紧急指令已拒绝',
        id: record.id,
      })
      return
    }

    // 入队（按优先级排序）
    this.pendingQueue.push({ record, frame, timestamp, priority })
    this.pendingQueue.sort((a, b) => a.priority - b.priority)

    cmdHistory.push(record)

    // 模拟执行
    const executed = this.dequeueOne()
    if (executed) {
      executed.record.status = 'executed'
      console.log(`[control] executed ${executed.record.cmdName} → ${device_id} (priority=${priority})`)
    }

    await this.publishCommand(record, frame, device_id, priority, req.body.params || {})

    const result: any = {
      id: record.id,
      status: record.status,
      device_id,
      command: CMD_NAMES[cmdNum],
      signature_hex: frame.subarray(frame.length - 32).toString('hex'),
      nonce,
      timestamp,
      emergency_override: this.emergencyOverride,
      queue_length: this.pendingQueue.length,
    }

    if (this.emergencyOverride && priority === 0) {
      result.note = 'EMERGENCY: All non-critical commands preempted'
    } else {
      result.note = 'Send this signed frame to the edge gateway via realtime-hub WebSocket (type=0x03)'
    }

    res.json(result)
  }

  /** 从队列取出最高优先级指令执行 */
  private dequeueOne(): PendingCommand | null {
    if (this.pendingQueue.length === 0) return null
    return this.pendingQueue.shift() || null
  }

  /** GET /api/v1/control/override/status */
  getOverrideStatus(_req: Request, res: Response): void {
    res.json({
      emergency_override: this.emergencyOverride,
      pending_count: this.pendingQueue.length,
      pending: this.pendingQueue.map(p => ({
        id: p.record.id,
        command: p.record.cmdName,
        priority: p.priority,
        createdAt: p.record.createdAt,
      })),
    })
  }

  /** POST /api/v1/control/override/clear */
  clearOverride(_req: Request, res: Response): void {
    this.emergencyOverride = false
    console.log('[control] emergency override cleared')
    res.json({ emergency_override: false, message: '紧急模式已解除' })
  }

  /** GET /api/v1/control/status */
  getStatus(req: Request, res: Response): void {
    const id = req.query.id as string
    if (id) {
      const record = cmdHistory.find(r => r.id === id)
      if (!record) {
        res.status(404).json({ error: 'command not found' })
        return
      }
      res.json(record)
      return
    }

    res.json({
      total: cmdHistory.length,
      recent: cmdHistory.slice(-20).reverse(),
    })
  }

  async close(): Promise<void> {
    if (this.redis && this.redis.status !== 'end') {
      await this.redis.quit()
    }
    this.redis = null
  }

  private ensureRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis(REDIS_URL, {
        connectTimeout: 500,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 2) return null
          return Math.min(times * 200, 2000)
        },
        lazyConnect: true,
      })
      this.redis.on('connect', () => console.log('[control] Redis connected'))
      this.redis.on('error', (err) => console.warn('[control] Redis error:', err.message))
    }
    return this.redis
  }

  private async publish(channel: string, event: Record<string, unknown>): Promise<void> {
    try {
      const redis = this.ensureRedis()
      if (redis.status === 'wait') {
        await redis.connect()
      }
      await redis.publish(channel, JSON.stringify(event))
    } catch (err: any) {
      console.warn(`[control] ${channel} publish skipped: ${err.message}`)
    }
  }

  private async publishCommand(
    record: CommandRecord,
    frame: Buffer,
    deviceId: string,
    priority: number,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.publish('control_command', {
      id: record.id,
      device_id: deviceId,
      command: record.cmdName,
      command_code: record.command,
      params,
      priority,
      nonce: record.nonce,
      frame_hex: frame.toString('hex'),
      ts: record.createdAt,
      status: 'sent',
    })
    await this.publishCommandResult(record, deviceId, priority)
  }

  private async publishCommandResult(record: CommandRecord, deviceId: string, priority: number): Promise<void> {
    await this.publish('cmd_result', {
      id: record.id,
      device_id: deviceId,
      command: record.cmdName,
      command_code: record.command,
      priority,
      status: record.status,
      emergency_override: this.emergencyOverride,
      queue_length: this.pendingQueue.length,
      ts: Date.now(),
    })
  }
}

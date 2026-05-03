/**
 * 指令下发控制器
 *
 * POST /api/v1/control/command  — 下发 HMAC 签名控制指令
 * GET  /api/v1/control/status   — 查询指令执行状态
 */

import { Request, Response } from 'express'
import { SignerService } from '../services/signer.service'

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

export class CommandController {
  private signer = new SignerService()

  /** POST /api/v1/control/command */
  issueCommand(req: Request, res: Response): void {
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
    cmdHistory.push(record)

    console.log(`[control] issued ${CMD_NAMES[cmdNum]} → ${device_id} (nonce=${nonce})`)

    res.json({
      id: record.id,
      status: 'pending',
      device_id,
      command: CMD_NAMES[cmdNum],
      signature_hex: frame.subarray(frame.length - 32).toString('hex'),
      nonce,
      timestamp,
      note: 'Send this signed frame to the edge gateway via realtime-hub WebSocket (type=0x03)',
    })
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
}

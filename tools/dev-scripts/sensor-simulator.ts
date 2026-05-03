/**
 * 传感器数据模拟器 — 模拟边缘网关向 realtime-hub 推送传感器数据
 *
 * 用法: npx tsx tools/dev-scripts/sensor-simulator.ts [--interval 1000] [--ws ws://localhost:3001]
 *
 * 发送频率默认 1s（模拟真实硬件 100ms 采样周期，但演示环境适度降频）
 */

import WebSocket from 'ws'

const WS_URL = process.env.WS_URL || 'ws://localhost:3001'
const INTERVAL_MS = parseInt(process.env.INTERVAL || '1000', 10)
const JWT_SECRET = 'aqua-dev-secret-change-in-prod'

// 简易 JWT 生成 (避免依赖)
function makeToken(poolId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: `sim-${poolId}`,
    node: `pool-${poolId}-gateway`,
    iat: Math.floor(Date.now() / 1000),
  })).toString('base64url')
  const crypto = require('crypto')
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

// CRC-16/Modbus
function crc16(buf: Buffer): number {
  let crc = 0xFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xA001
      else crc = crc >> 1
    }
  }
  return crc
}

// 构建二进制帧
function buildFrame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(6)
  header[0] = 0x55
  header[1] = 0xAA
  header[2] = 1        // version
  header[3] = type     // 0x01=telemetry, 0x04=heartbeat
  header.writeUInt16BE(payload.length, 4)

  const crc = crc16(Buffer.concat([header, payload]))
  const crcBuf = Buffer.alloc(2)
  crcBuf.writeUInt16BE(crc, 0)

  return Buffer.concat([header, payload, crcBuf])
}

// 传感器模拟配置
interface SensorConfig {
  type: string
  unit: string
  base: number
  noise: number
}

const SENSOR_CONFIGS: SensorConfig[] = [
  { type: 'DO',   unit: 'mg/L',  base: 5.8,  noise: 0.4 },
  { type: 'pH',   unit: 'pH',    base: 7.6,  noise: 0.15 },
  { type: 'TEMP', unit: '°C',    base: 27.2, noise: 0.5 },
  { type: 'NH3N', unit: 'mg/L',  base: 0.15, noise: 0.03 },
  { type: 'COND', unit: 'mS/cm', base: 2.4,  noise: 0.1 },
  { type: 'ORP',  unit: 'mV',    base: 320,  noise: 10 },
]

const POOLS = ['P01', 'P02']

function generateReading(config: SensorConfig): number {
  const v = config.base + (Math.random() - 0.5) * config.noise * 2
  return Math.round(v * 100) / 100
}

function simulate() {
  console.log(`[simulator] connecting to ${WS_URL}...`)

  for (const pool of POOLS) {
    const ws = new WebSocket(`${WS_URL}?token=${makeToken(pool)}`)

    ws.on('open', () => {
      console.log(`[simulator] ${pool} connected`)

      // 发送遥测数据
      setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return

        for (const cfg of SENSOR_CONFIGS) {
          const payload = Buffer.from(JSON.stringify({
            pool_id: pool,
            sensor_type: cfg.type,
            value: generateReading(cfg),
            unit: cfg.unit,
            ts: Date.now(),
          }))

          const frame = buildFrame(0x01, payload)
          ws.send(frame, { binary: true })
        }
      }, INTERVAL_MS)

      // 心跳
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const frame = buildFrame(0x04, Buffer.from([0x01]))
          ws.send(frame, { binary: true })
        }
      }, 10_000)
    })

    ws.on('message', (data: Buffer) => {
      // 心跳 ACK
      if (data.length >= 4 && data[3] === 0x04) {
        // console.log(`[simulator] ${pool} heartbeat ACK`)
      }
    })

    ws.on('close', (code) => {
      console.log(`[simulator] ${pool} disconnected (code=${code})`)
    })

    ws.on('error', (err) => {
      console.error(`[simulator] ${pool} error:`, err.message)
    })
  }
}

simulate()
console.log(`[simulator] sending sensor data every ${INTERVAL_MS}ms, press Ctrl+C to stop`)

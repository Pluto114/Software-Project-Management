/**
 * 传感器数据模拟器 — 模拟边缘网关向 realtime-hub 推送传感器数据
 *
 * 用法: npx tsx tools/dev-scripts/sensor-simulator.ts
 *
 * 数据特征:
 *   - 30 分钟 DO 升降循环 (模拟增氧机启停)
 *   - 24h 昼夜水温波动 (±1.5°C)
 *   - 缓慢基线漂移 (模拟长期趋势)
 *   - 随机异常事件 (DO 骤降 → 触发告警)
 */

import WebSocket from 'ws'
import crypto from 'crypto'

const WS_URL = process.env.WS_URL || 'ws://localhost:3001'
const INTERVAL_MS = parseInt(process.env.INTERVAL || '1000', 10)
const JWT_SECRET = 'aqua-dev-secret-change-in-prod'

function makeToken(poolId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: `sim-${poolId}`,
    node: `pool-${poolId}-gateway`,
    iat: Math.floor(Date.now() / 1000),
  })).toString('base64url')
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

function buildFrame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(6)
  header[0] = 0x55
  header[1] = 0xAA
  header[2] = 1
  header[3] = type
  header.writeUInt16BE(payload.length, 4)
  const crc = crc16(Buffer.concat([header, payload]))
  const crcBuf = Buffer.alloc(2)
  crcBuf.writeUInt16BE(crc, 0)
  return Buffer.concat([header, payload, crcBuf])
}

// ========================
// 动态数据生成引擎
// ========================

const startTime = Date.now()

// 每个池独立基线 (模拟不同养殖环境)
const POOL_CONFIGS: Record<string, {
  doBase: number; tempBase: number; phBase: number
  nh3nBase: number; riskLevel: 'normal' | 'unstable' | 'critical'
}> = {
  P01: { doBase: 5.8, tempBase: 27.2, phBase: 7.6, nh3nBase: 0.15, riskLevel: 'normal' },
  P02: { doBase: 5.3, tempBase: 27.8, phBase: 7.4, nh3nBase: 0.18, riskLevel: 'unstable' },
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function generateValue(
  poolId: string,
  sensorType: string,
  tick: number,  // 递增计数器
): number {
  const cfg = POOL_CONFIGS[poolId] || POOL_CONFIGS['P01']
  const elapsedMin = tick * (INTERVAL_MS / 60000)  // 已运行分钟数

  switch (sensorType) {
    case 'DO': {
      // 30 分钟增氧机循环 + 昼夜光合作用节律 + 缓慢基线漂移 + 噪声
      const aeratorCycle = Math.sin(elapsedMin / 30 * Math.PI * 2) * 0.8  // 增氧机启停效果
      const diurnal = Math.sin(elapsedMin / 720 * Math.PI * 2) * 0.3        // 24h 昼夜
      const drift = -0.0003 * elapsedMin  // 缓慢下降 (模拟残饵耗氧)
      const noise = (Math.random() - 0.5) * 0.3
      const eventNoise = Math.random() < 0.002 ? -2.0 : 0  // 偶发骤降事件

      // P02 更不稳定
      const instability = cfg.riskLevel === 'unstable' ? (Math.sin(elapsedMin / 7) * 0.4) : 0
      return clamp(cfg.doBase + aeratorCycle + diurnal + drift + noise + eventNoise + instability, 2.0, 9.0)
    }
    case 'TEMP': {
      const diurnal = Math.sin(elapsedMin / 720 * Math.PI * 2 + 6) * 1.5  // 昼夜温差 ±1.5°C，下午最热
      const drift = 0.0001 * elapsedMin  // 缓慢升温
      const noise = (Math.random() - 0.5) * 0.2
      return clamp(cfg.tempBase + diurnal + drift + noise, 20, 35)
    }
    case 'pH': {
      // pH 与 DO 相关 (光合作用消耗 CO2 → pH 升高)
      const doEffect = Math.sin(elapsedMin / 30 * Math.PI * 2) * 0.15
      const noise = (Math.random() - 0.5) * 0.08
      return clamp(cfg.phBase + doEffect + noise, 6.5, 8.5)
    }
    case 'NH3N': {
      const drift = 0.00002 * elapsedMin  // 缓慢累积
      const noise = (Math.random() - 0.5) * 0.02
      return clamp(cfg.nh3nBase + drift + noise, 0.05, 0.5)
    }
    case 'COND': {
      const noise = (Math.random() - 0.5) * 0.15
      return clamp(2.4 + noise, 1.5, 4.0)
    }
    case 'ORP': {
      const noise = (Math.random() - 0.5) * 15
      return clamp(320 + noise, 200, 500)
    }
    default:
      return 0
  }
}

const POOLS = ['P01', 'P02']
const SENSORS = ['DO', 'pH', 'TEMP', 'NH3N', 'COND', 'ORP']
const UNITS: Record<string, string> = {
  DO: 'mg/L', pH: 'pH', TEMP: '°C', NH3N: 'mg/L', COND: 'mS/cm', ORP: 'mV',
}

function simulate() {
  console.log(`[simulator] connecting to ${WS_URL}...`)
  let tick = 0

  for (const pool of POOLS) {
    const ws = new WebSocket(`${WS_URL}?token=${makeToken(pool)}`)

    ws.on('open', () => {
      console.log(`[simulator] ${pool} connected (risk=${POOL_CONFIGS[pool].riskLevel})`)

      setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        tick++

        for (const sensorType of SENSORS) {
          const value = generateValue(pool, sensorType, tick)
          const rounded = Math.round(value * 100) / 100

          const payload = Buffer.from(JSON.stringify({
            pool_id: pool,
            sensor_type: sensorType,
            value: rounded,
            unit: UNITS[sensorType],
            ts: Date.now(),
          }))

          const frame = buildFrame(0x01, payload)
          ws.send(frame, { binary: true })
        }

        // 每分钟打印一次摘要
        if (tick % 60 === 0) {
          const doVal = generateValue(pool, 'DO', tick)
          console.log(`[simulator] ${pool} tick=${tick} DO=${doVal.toFixed(2)}mg/L`)
        }
      }, INTERVAL_MS)

      // 心跳
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(buildFrame(0x04, Buffer.from([0x01])), { binary: true })
        }
      }, 10_000)
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
console.log(`[simulator] data has diurnal rhythm + aerator cycles + drift + random events`)

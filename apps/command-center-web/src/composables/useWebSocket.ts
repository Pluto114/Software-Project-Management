/**
 * WebSocket 客户端 — 连接 realtime-hub，解析二进制帧，更新 Pinia store
 *
 * 连接失败时自动降级到 Pinia 模拟数据（保证演示始终可用）
 */

import { ref, onUnmounted } from 'vue'
import { useSensorStore, SensorReading } from '../stores/sensorData'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
const RECONNECT_DELAY = 3000

// CRC-16/Modbus
function crc16(buf: Uint8Array): number {
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

/** 简易 JWT 生成 (dev only — 生产应由后端签发) */
function makeDevToken(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    sub: 'command-center-web',
    node: 'frontend',
    iat: Math.floor(Date.now() / 1000),
  }))
  return `${header}.${payload}.dev`
}

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const connected = ref(false)
const fallbackActive = ref(false)

export function useWebSocket() {
  const store = useSensorStore()

  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return

    const token = makeDevToken()
    try {
      ws = new WebSocket(`${WS_URL}?token=${token}`)
    } catch {
      activateFallback()
      return
    }

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      connected.value = true
      fallbackActive.value = false
      store.stopSimulation()
      console.log('[ws] connected to realtime-hub')
    }

    ws.onmessage = (event: MessageEvent) => {
      const data = new Uint8Array(event.data as ArrayBuffer)
      handleBinaryFrame(data)
    }

    ws.onclose = () => {
      connected.value = false
      console.log('[ws] disconnected, reconnecting in', RECONNECT_DELAY, 'ms...')
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY)
    }

    ws.onerror = () => {
      // 连接失败 → 降级
      ws?.close()
      activateFallback()
    }
  }

  function handleBinaryFrame(data: Uint8Array) {
    if (data.length < 8) return

    // 帧头校验
    if (data[0] !== 0x55 || data[1] !== 0xAA) return

    const type = data[3]
    const payloadLen = (data[4] << 8) | data[5]
    const payload = data.subarray(6, 6 + payloadLen)

    // CRC 校验
    const crcReceived = (data[6 + payloadLen] << 8) | data[7 + payloadLen]
    const crcCalc = crc16(data.subarray(0, 6 + payloadLen))
    if (crcCalc !== crcReceived) return

    switch (type) {
      case 0x01: handleTelemetry(payload); break
      case 0x02: handleAlert(payload); break
      case 0x04: break // heartbeat ACK, ignore
    }
  }

  function handleTelemetry(payload: Uint8Array) {
    try {
      const msg = JSON.parse(new TextDecoder().decode(payload))
      const { pool_id, sensor_type, value, unit, ts } = msg

      const reading: SensorReading = {
        sensorId: `${pool_id}-${sensor_type}`,
        poolId: pool_id,
        type: sensor_type,
        value,
        unit: unit || '',
        timestamp: ts || Date.now(),
        quality: 1.0,
      }

      // 更新 Map 并触发响应式
      const newMap = new Map(store.latestReadings)
      newMap.set(reading.sensorId, reading)
      store.latestReadings = newMap
    } catch {
      // 忽略无效消息
    }
  }

  function handleAlert(payload: Uint8Array) {
    try {
      const msg = JSON.parse(new TextDecoder().decode(payload))
      store.addAlert({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        level: msg.level || 'yellow',
        poolId: msg.pool_id || 'unknown',
        ruleId: msg.rule || 'unknown',
        message: msg.message || '',
        triggeredAt: Date.now(),
        confirmed: false,
      })

      if (msg.level === 'red') store.alertLevel = 'red'
      else if (msg.level === 'yellow' && store.alertLevel !== 'red') store.alertLevel = 'yellow'
    } catch { /* ignore */ }
  }

  function activateFallback() {
    fallbackActive.value = true
    connected.value = false
    console.log('[ws] using simulated data fallback')
    store.startSimulation()
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (ws) {
      ws.onclose = null // 阻止重连
      ws.close()
      ws = null
    }
  }

  // 自动清理
  onUnmounted(disconnect)

  return { connected, fallbackActive, connect, disconnect }
}

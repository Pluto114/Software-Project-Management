import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface SensorReading {
  sensorId: string
  poolId: string
  type: 'DO' | 'pH' | 'TEMP' | 'ORP' | 'NH3N' | 'COND'
  value: number
  unit: string
  timestamp: number
  quality: number // 0-1 数据质量分数
}

export interface Alert {
  id: string
  level: 'green' | 'yellow' | 'red'
  poolId: string
  ruleId: string
  message: string
  triggeredAt: number
  confirmed: boolean
}

export interface DeviceStatus {
  deviceId: string
  poolId: string
  type: 'aerator' | 'feeder' | 'pump'
  status: 'on' | 'off'
  speed?: number // 增氧机转速 0-100
  current?: number // 当前电流 A
}

export interface AIPrediction {
  poolId: string
  timestamp: number
  horizon: number // 预测时长 min
  predictedValues: number[]
  lowerBound: number[]
  upperBound: number[]
  confidence: number
}

export const useSensorStore = defineStore('sensor', () => {
  // 实时数据
  const latestReadings = ref<Map<string, SensorReading>>(new Map())
  const historyBuffer = ref<SensorReading[]>([]) // 最近 30min 数据

  // AI 预测
  const currentPrediction = ref<AIPrediction | null>(null)

  // 告警
  const alertLevel = ref<'green' | 'yellow' | 'red'>('green')
  const activeAlerts = ref<Alert[]>([])

  // 设备
  const devices = ref<DeviceStatus[]>([])

  // 数据源: 'ws' | 'sim' | 'none'
  const dataSource = ref<'ws' | 'sim' | 'none'>('none')

  // 系统状态
  const onlineNodes = ref(6)
  const totalNodes = ref(8)
  const networkLatency = ref(12)
  const msgRate = ref(0)
  const wsConnections = ref(3)
  const e2eLatency = ref(68)
  const uptime = ref('12d 4h 32m')

  // 风险因子（来自 AI 分析）
  const riskFactors = ref([
    { name: '气压突变', weight: 38, description: '外部天气变化可能影响夜间溶氧稳定性' },
    { name: '氨氮累积', weight: 33, description: '底层残饵和代谢物增加，逼近安全边界' },
    { name: '水温变化', weight: 29, description: '傍晚温差变化影响摄食和溶氧消耗节奏' },
  ])

  // 模拟数据更新（开发用，WebSocket 可用时自动停用）
  let simTimer: number | null = null
  let simTick = 0
  // 保持状态以模拟时间连续性
  const simState: Record<string, Record<string, number>> = {
    'P01': { DO: 5.8, pH: 7.6, TEMP: 27.2, NH3N: 0.15 },
    'P02': { DO: 5.3, pH: 7.4, TEMP: 27.8, NH3N: 0.18 },
  }
  function startSimulation() {
    dataSource.value = 'sim'
    const poolIds = ['P01', 'P02']
    const sensorTypes = ['DO', 'pH', 'TEMP', 'NH3N'] as const
    const units: Record<string, string> = { DO: 'mg/L', pH: 'pH', TEMP: '°C', NH3N: 'mg/L' }
    const ranges: Record<string, [number, number]> = { DO: [2, 9], pH: [6.5, 8.5], TEMP: [20, 35], NH3N: [0.05, 0.5] }

    simTimer = window.setInterval(() => {
      simTick++
      const ts = Date.now() * 1_000_000
      const elapsedMin = simTick * (1000 / 60000)  // 1s 间隔

      for (const poolId of poolIds) {
        const state = simState[poolId]
        for (const type of sensorTypes) {
          // 基于当前值做小幅度变化 (时间连续性)
          let delta = 0
          switch (type) {
            case 'DO': {
              const aeratorCycle = Math.sin(elapsedMin / 30 * Math.PI * 2) * 0.04
              const drift = -0.0002
              const noise = (Math.random() - 0.5) * 0.15
              delta = aeratorCycle + drift + noise
              break
            }
            case 'TEMP': {
              const diurnal = Math.cos(elapsedMin / 720 * Math.PI * 2) * 0.01
              const noise = (Math.random() - 0.5) * 0.08
              delta = diurnal + noise
              break
            }
            case 'pH': {
              const doEffect = Math.sin(elapsedMin / 30 * Math.PI * 2) * 0.005
              const noise = (Math.random() - 0.5) * 0.03
              delta = doEffect + noise
              break
            }
            case 'NH3N': {
              const drift = 0.00001
              const noise = (Math.random() - 0.5) * 0.005
              delta = drift + noise
              break
            }
          }
          const [lo, hi] = ranges[type]
          state[type] = Math.max(lo, Math.min(hi, state[type] + delta))

          const reading: SensorReading = {
            sensorId: `${poolId}-${type}`,
            poolId,
            type: type as 'DO' | 'pH' | 'TEMP' | 'NH3N',
            value: Math.round(state[type] * 100) / 100,
            unit: units[type],
            timestamp: ts,
            quality: 0.95 + Math.random() * 0.05,
          }
          latestReadings.value.set(reading.sensorId, reading)

          // 累计历史缓冲 (用于图表)
          historyBuffer.value.push(reading)
          if (historyBuffer.value.length > 3600) historyBuffer.value.shift()
        }
      }
      // 更新指标 (有波动)
      msgRate.value = Math.floor(800 + Math.sin(simTick / 120) * 300 + Math.random() * 100)
      e2eLatency.value = Math.floor(55 + Math.sin(simTick / 60) * 20 + Math.random() * 10)
      networkLatency.value = Math.floor(10 + Math.random() * 12)
    }, 1000)
  }

  function stopSimulation() {
    if (simTimer !== null) {
      clearInterval(simTimer)
      simTimer = null
    }
  }

  // 切换告警等级（Demo 用）
  function setAlertLevel(level: 'green' | 'yellow' | 'red') {
    alertLevel.value = level
  }

  // 添加告警
  function addAlert(alert: Alert) {
    activeAlerts.value.unshift(alert)
    if (activeAlerts.value.length > 50) activeAlerts.value.pop()
  }

  return {
    latestReadings, historyBuffer, currentPrediction,
    alertLevel, activeAlerts, devices,
    dataSource,
    onlineNodes, totalNodes, networkLatency, msgRate, wsConnections, e2eLatency, uptime,
    riskFactors,
    startSimulation, stopSimulation, setAlertLevel, addAlert,
  }
})

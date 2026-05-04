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
  function startSimulation() {
    dataSource.value = 'sim'
    const poolIds = ['pool-01', 'pool-02']
    const sensorTypes = ['DO', 'pH', 'TEMP'] as const
    simTimer = window.setInterval(() => {
      const ts = Date.now() * 1_000_000 // 模拟纳秒时间戳
      for (const poolId of poolIds) {
        for (const type of sensorTypes) {
          const reading: SensorReading = {
            sensorId: `${poolId}-${type}`,
            poolId,
            type,
            value: type === 'DO' ? 5.0 + Math.random() * 3 :
                   type === 'pH' ? 7.0 + Math.random() * 1.2 :
                   26.0 + Math.random() * 3,
            unit: type === 'DO' ? 'mg/L' : type === 'pH' ? 'pH' : '°C',
            timestamp: ts,
            quality: 0.95 + Math.random() * 0.05,
          }
          latestReadings.value.set(reading.sensorId, reading)
        }
      }
      // 更新模拟指标
      msgRate.value = Math.floor(800 + Math.random() * 400)
      e2eLatency.value = Math.floor(45 + Math.random() * 40)
      networkLatency.value = Math.floor(8 + Math.random() * 15)
    }, 1000) // 1s 更新一次用于 Demo，实际 100ms
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

/**
 * 溶解氧预警规则链
 *
 * 规则:
 * - DO < 5.0 mg/L  → 黄色预警 (trend_warn)
 * - DO < 4.5 mg/L  → 红色告警 (critical)
 * - 5min 下降速率 > 0.1 mg/L/min → 趋势预警
 * - 复合风险: DO ↓ + TEMP ↑ + NH3N ↑ → 高风险
 */

export type RiskLevel = 'green' | 'yellow' | 'red'

export interface RuleResult {
  ruleName: string
  triggered: boolean
  level: RiskLevel
  message: string
  sensorType: string
  currentValue: number
  threshold: number
}

export function evaluateDO(value: number): RuleResult[] {
  const results: RuleResult[] = []

  // 红色告警
  if (value < 4.5) {
    results.push({
      ruleName: 'DO_Critical',
      triggered: true,
      level: 'red',
      message: `溶解氧 ${value}mg/L 低于 4.5mg/L 红线，立即启动全负荷增氧`,
      sensorType: 'DO',
      currentValue: value,
      threshold: 4.5,
    })
    return results
  }

  // 黄色预警
  if (value < 5.0) {
    results.push({
      ruleName: 'DO_Warning',
      triggered: true,
      level: 'yellow',
      message: `溶解氧 ${value}mg/L 低于 5.0mg/L 预警线，建议检查增氧设备`,
      sensorType: 'DO',
      currentValue: value,
      threshold: 5.0,
    })
  }

  return results
}

/** 趋势检测: 检测 DO 下降速率 */
export function evaluateDOTrend(window: number[]): RuleResult | null {
  if (window.length < 5) return null

  // 简易速率估计: (first - last) / time_span
  const first = window[0]
  const last = window[window.length - 1]
  const dropRate = (first - last) / window.length // per sample

  if (dropRate > 0.02) {
    return {
      ruleName: 'DO_TrendDown',
      triggered: true,
      level: 'yellow',
      message: `溶解氧下降速率异常 (${(dropRate * 60).toFixed(2)} mg/L/min)，趋势预警`,
      sensorType: 'DO',
      currentValue: last,
      threshold: 0.1,
    }
  }

  return null
}

/** 复合风险: DO ↓ + TEMP ↑ + NH3N ↑ */
export function evaluateCompoundRisk(readings: Record<string, number>): RuleResult | null {
  const do_ = readings['DO']
  const temp = readings['TEMP']
  const nh3n = readings['NH3N']

  if (!do_ || !temp || !nh3n) return null

  let score = 0
  if (do_ < 5.5) score += 2
  if (do_ < 5.0) score += 3
  if (temp > 28) score += 2
  if (temp > 30) score += 3
  if (nh3n > 0.2) score += 2
  if (nh3n > 0.35) score += 3

  if (score >= 5) {
    return {
      ruleName: 'Compound_Risk',
      triggered: true,
      level: score >= 7 ? 'red' : 'yellow',
      message: `多参数复合风险 (得分=${score}): DO=${do_}mg/L, TEMP=${temp}°C, NH3N=${nh3n}mg/L`,
      sensorType: 'DO',
      currentValue: do_,
      threshold: 0,
    }
  }

  return null
}

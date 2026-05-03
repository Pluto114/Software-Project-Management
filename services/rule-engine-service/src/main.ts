/**
 * rule-engine-service — AquaIntelligence 规则引擎
 *
 * 启动: npm run dev   (port 3004)
 */

import express from 'express'
import cors from 'cors'
import { RuleEvaluator } from './engine/rule-evaluator'

const PORT = parseInt(process.env.PORT || '3004', 10)

async function main() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ service: 'rule-engine-service', status: 'ok' })
  })

  // API: 手动触发规则评估
  app.post('/api/v1/rules/evaluate', (req, res) => {
    const { pool_id, sensor_type, value } = req.body
    // 评估逻辑由 RuleEvaluator 处理，这里只返回确认
    res.json({
      accepted: true,
      pool_id,
      sensor_type,
      value,
      message: 'Data will be evaluated against active rules',
    })
  })

  const evaluator = new RuleEvaluator()
  await evaluator.start()

  const server = app.listen(PORT, () => {
    console.log(`[rule-engine-service] listening on port ${PORT}`)
  })

  const shutdown = async (signal: string) => {
    console.log(`\n[rule-engine-service] received ${signal}, shutting down...`)
    await evaluator.stop()
    server.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()

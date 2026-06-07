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

  const evaluator = new RuleEvaluator()

  app.get('/health', (_req, res) => {
    res.json({ service: 'rule-engine-service', status: 'ok' })
  })

  // API: 手动触发规则评估
  app.post('/api/v1/rules/evaluate', async (req, res) => {
    const { pool_id, sensor_type, value } = req.body
    const results = await evaluator.evaluatePayload({ pool_id, sensor_type, value })
    res.json({
      accepted: true,
      pool_id,
      sensor_type,
      value,
      triggered: results.length,
      results,
    })
  })

  app.get('/api/v1/alerts', (req, res) => {
    const poolId = req.query.pool_id as string | undefined
    const level = req.query.level as string | undefined
    const limit = parseInt(req.query.limit as string || '50', 10)
    const alerts = evaluator.getAlerts({ poolId, level, limit })
    res.json({ total: alerts.length, alerts })
  })

  app.post('/api/v1/alerts/:id/confirm', (req, res) => {
    const alert = evaluator.confirmAlert(req.params.id)
    if (!alert) {
      res.status(404).json({ error: 'alert not found' })
      return
    }
    res.json({ confirmed: true, alert })
  })

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

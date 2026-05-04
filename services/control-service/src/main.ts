/**
 * control-service — AquaIntelligence 设备控制服务
 *
 * 启动: npm run dev   (port 3003)
 */

import express from 'express'
import cors from 'cors'
import { CommandController } from './controllers/command.controller'

const PORT = parseInt(process.env.PORT || '3003', 10)

async function main() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  const ctrl = new CommandController()

  app.get('/health', (_req, res) => {
    res.json({ service: 'control-service', status: 'ok' })
  })

  app.post('/api/v1/control/command', (req, res) => ctrl.issueCommand(req, res))
  app.get('/api/v1/control/status', (req, res) => ctrl.getStatus(req, res))
  app.get('/api/v1/control/override/status', (req, res) => ctrl.getOverrideStatus(req, res))
  app.post('/api/v1/control/override/clear', (req, res) => ctrl.clearOverride(req, res))

  const server = app.listen(PORT, () => {
    console.log(`[control-service] listening on port ${PORT}`)
    console.log(`[control-service] POST /api/v1/control/command`)
    console.log(`[control-service] GET  /api/v1/control/status`)
  })

  const shutdown = async (signal: string) => {
    console.log(`\n[control-service] received ${signal}, shutting down...`)
    server.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()

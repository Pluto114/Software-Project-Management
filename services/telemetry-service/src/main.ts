/**
 * telemetry-service — AquaIntelligence 遥测服务
 *
 * 启动: npm run dev   (port 3002)
 */

import express from 'express'
import cors from 'cors'
import { DataIngest } from './ingest/data-ingest'
import { TimeseriesQuery } from './query/timeseries-query'

const PORT = parseInt(process.env.PORT || '3002', 10)

async function main() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // 健康检查
  app.get('/health', (_req, res) => {
    res.json({ service: 'telemetry-service', status: 'ok' })
  })

  // 数据接入
  const ingest = new DataIngest()

  // 查询 API
  const query = new TimeseriesQuery()
  app.get('/api/v1/assets/realtime', (req, res) => query.getRealtime(req, res))
  app.get('/api/v1/assets/history', (req, res) => query.getHistory(req, res))

  // 启动数据接入
  await ingest.start()

  const server = app.listen(PORT, () => {
    console.log(`[telemetry-service] listening on port ${PORT}`)
    console.log(`[telemetry-service] GET /api/v1/assets/realtime?pool_id=P01`)
    console.log(`[telemetry-service] GET /api/v1/assets/history?pool_id=P01&metric=DO`)
  })

  const shutdown = async (signal: string) => {
    console.log(`\n[telemetry-service] received ${signal}, shutting down...`)
    await ingest.stop()
    await query.close()
    server.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()

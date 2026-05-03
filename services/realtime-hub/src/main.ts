/**
 * realtime-hub — AquaIntelligence 实时数据枢纽
 *
 * 启动: npm run dev   (tsx watch, port 3001)
 *        npm run build && npm start
 */

import { WebSocketGateway } from './gateway/websocket.gateway'

const PORT = parseInt(process.env.PORT || '3001', 10)

async function main() {
  const gateway = new WebSocketGateway()
  gateway.start(PORT)

  const shutdown = async (signal: string) => {
    console.log(`\n[realtime-hub] received ${signal}, shutting down...`)
    await gateway.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()

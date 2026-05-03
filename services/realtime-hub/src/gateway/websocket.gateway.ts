/**
 * WebSocket 网关 — 二进制帧解析、JWT 认证、心跳管理
 *
 * 帧协议: [0xAA][0x55][version(1B)][type(1B)][payloadLen(2B)][payload(N)][crc16(2B)]
 * 最小帧长: 8 bytes (header 2 + version 1 + type 1 + len 2 + crc 2)
 * 最大帧长: 65543 bytes (header 2 + version 1 + type 1 + len 2 + 65535 + crc 2)
 */

import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import jwt from 'jsonwebtoken'
import { MessageRouter } from '../services/message-router'

const FRAME_HEADER = 0xAA55
const FRAME_MIN_LEN = 8
const FRAME_MAX_PAYLOAD = 65535

const FRAME_TYPE_TELEMETRY = 0x01
const FRAME_TYPE_ALERT = 0x02
const FRAME_TYPE_COMMAND = 0x03
const FRAME_TYPE_HEARTBEAT = 0x04

const HEARTBEAT_INTERVAL_MS = 10_000
const HEARTBEAT_TIMEOUT_MS = 35_000

const JWT_SECRET = process.env.JWT_SECRET || 'aqua-dev-secret-change-in-prod'

interface ClientMeta {
  clientId: string
  nodeId: string
  connectedAt: number
  lastHeartbeat: number
  ws: WebSocket
}

export class WebSocketGateway {
  private wss: WebSocketServer | null = null
  private clients = new Map<WebSocket, ClientMeta>()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private router: MessageRouter

  constructor() {
    this.router = new MessageRouter()
  }

  /** 启动 WebSocket 服务器 */
  start(port: number): void {
    const httpServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ service: 'realtime-hub', status: 'ok', clients: this.clients.size }))
    })

    this.wss = new WebSocketServer({ server: httpServer, maxPayload: FRAME_MAX_PAYLOAD + 8 })

    this.wss.on('connection', (ws, req) => {
      const token = this.extractToken(req)
      if (!token) {
        ws.close(4001, 'Missing JWT token')
        return
      }

      let payload: { sub: string; node: string }
      try {
        payload = jwt.verify(token, JWT_SECRET) as { sub: string; node: string }
      } catch {
        ws.close(4002, 'Invalid JWT token')
        return
      }

      const meta: ClientMeta = {
        clientId: payload.sub,
        nodeId: payload.node || 'unknown',
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
        ws,
      }

      this.clients.set(ws, meta)
      console.log(`[ws] client connected: ${meta.clientId} (node=${meta.nodeId}), total=${this.clients.size}`)

      ws.on('message', (data: Buffer) => {
        meta.lastHeartbeat = Date.now()
        this.handleFrame(ws, data)
      })

      ws.on('close', () => {
        this.clients.delete(ws)
        console.log(`[ws] client disconnected: ${meta.clientId}, total=${this.clients.size}`)
      })

      ws.on('error', (err) => {
        console.error(`[ws] error from ${meta.clientId}:`, err.message)
        this.clients.delete(ws)
      })
    })

    // 心跳检测定时器
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      for (const [ws, meta] of this.clients) {
        if (now - meta.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
          console.log(`[ws] heartbeat timeout: ${meta.clientId}`)
          ws.close(4003, 'Heartbeat timeout')
          this.clients.delete(ws)
        }
      }
    }, HEARTBEAT_INTERVAL_MS)

    httpServer.listen(port, () => {
      console.log(`[realtime-hub] WebSocket server listening on port ${port}`)
    })
  }

  /** 停止服务 */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null

    for (const [ws, meta] of this.clients) {
      console.log(`[ws] disconnecting: ${meta.clientId}`)
      ws.close(1001, 'Server shutting down')
    }
    this.clients.clear()

    if (this.wss) {
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()))
      this.wss = null
    }

    await this.router.close()
  }

  /** 广播消息到所有客户端 */
  broadcast(data: Buffer): void {
    for (const ws of this.clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    }
  }

  /** 从 URL query 提取 JWT token */
  private extractToken(req: import('http').IncomingMessage): string | null {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    return url.searchParams.get('token')
  }

  /** 处理二进制帧 */
  private handleFrame(ws: WebSocket, data: Buffer): void {
    if (data.length < FRAME_MIN_LEN) {
      console.warn('[ws] frame too short:', data.length)
      return
    }

    // 帧头校验 (0xAA55 LE -> [0x55, 0xAA])
    if (data[0] !== 0x55 || data[1] !== 0xAA) {
      console.warn('[ws] invalid frame header')
      return
    }

    const version = data[2]
    const type = data[3]
    const payloadLen = data.readUInt16BE(4)
    const payload = data.subarray(6, 6 + payloadLen)
    const crcReceived = data.readUInt16BE(6 + payloadLen)

    // CRC-16 校验
    const crcCalc = crc16(data.subarray(0, 6 + payloadLen))
    if (crcCalc !== crcReceived) {
      console.warn('[ws] CRC mismatch')
      return
    }

    console.log(`[ws] frame: v${version} type=0x${type.toString(16)} len=${payloadLen}`)

    switch (type) {
      case FRAME_TYPE_TELEMETRY: {
        this.router.routeTelemetry(payload)
        break
      }
      case FRAME_TYPE_ALERT: {
        this.router.routeAlert(payload)
        break
      }
      case FRAME_TYPE_COMMAND: {
        this.router.routeCommandResult(payload)
        break
      }
      case FRAME_TYPE_HEARTBEAT: {
        // 心跳帧直接回复 ACK
        const ackFrame = buildFrame(FRAME_TYPE_HEARTBEAT, Buffer.from([0x01]))
        ws.send(ackFrame, { binary: true })
        break
      }
      default:
        console.warn('[ws] unknown frame type:', type.toString(16))
    }
  }
}

// ============================================================
// 帧工具函数
// ============================================================

/** 构建二进制帧 */
export function buildFrame(type: number, payload: Buffer, version = 1): Buffer {
  if (payload.length > FRAME_MAX_PAYLOAD) {
    throw new Error(`Payload too large: ${payload.length} > ${FRAME_MAX_PAYLOAD}`)
  }

  const header = Buffer.alloc(6)
  header[0] = 0x55
  header[1] = 0xAA
  header[2] = version
  header[3] = type
  header.writeUInt16BE(payload.length, 4)

  const crc = crc16(Buffer.concat([header, payload]))
  const crcBuf = Buffer.alloc(2)
  crcBuf.writeUInt16BE(crc, 0)

  return Buffer.concat([header, payload, crcBuf])
}

/** CRC-16/Modbus (多项式 0x8005, 初始值 0xFFFF) */
export function crc16(buf: Buffer): number {
  let crc = 0xFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001
      } else {
        crc = crc >> 1
      }
    }
  }
  return crc
}

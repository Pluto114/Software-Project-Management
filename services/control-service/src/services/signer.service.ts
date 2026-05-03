/**
 * HMAC 指令签名服务
 *
 * 指令包结构: timestamp(8B) + nonce(8B) + deviceId(4B) + command(2B) + payload(N) + signature(32B)
 * 防重放: timestamp 有效期 2000ms, nonce 全局唯一
 */

import crypto from 'crypto'

const HMAC_KEY = process.env.HMAC_KEY || 'aqua-hmac-dev-key-32bytes!!'
const NONCE_WINDOW_MS = 2000

const usedNonces = new Set<string>()

export class SignerService {
  /** 生成 HMAC-SHA256 签名 */
  sign(deviceId: string, command: number, payload: Buffer): {
    frame: Buffer
    nonce: string
    timestamp: number
  } {
    const timestamp = Date.now()
    const nonce = crypto.randomBytes(8).toString('hex')

    // 构造待签名数据
    const tsBuf = Buffer.alloc(8)
    tsBuf.writeBigUInt64BE(BigInt(timestamp), 0)

    const nonceBuf = Buffer.from(nonce, 'hex')
    const devBuf = Buffer.alloc(4)
    devBuf.writeUInt32BE(parseInt(deviceId.replace(/\D/g, '')) || 1, 0)

    const cmdBuf = Buffer.alloc(2)
    cmdBuf.writeUInt16BE(command, 0)

    const signData = Buffer.concat([tsBuf, nonceBuf, devBuf, cmdBuf, payload])
    const hmac = crypto.createHmac('sha256', HMAC_KEY).update(signData).digest()

    const frame = Buffer.concat([signData, hmac])
    return { frame, nonce, timestamp }
  }

  /** 验签（边缘侧使用） */
  verify(frame: Buffer): { valid: boolean; reason?: string; deviceId?: number; command?: number } {
    if (frame.length < 54) {
      return { valid: false, reason: 'frame too short' }
    }

    const tsBuf = frame.subarray(0, 8)
    const nonceBuf = frame.subarray(8, 16)
    const devBuf = frame.subarray(16, 20)
    const cmdBuf = frame.subarray(20, 22)
    const payload = frame.subarray(22, frame.length - 32)
    const signature = frame.subarray(frame.length - 32)

    // 时间窗口校验
    const timestamp = Number(tsBuf.readBigUInt64BE(0))
    if (Math.abs(Date.now() - timestamp) > NONCE_WINDOW_MS) {
      return { valid: false, reason: 'timestamp expired' }
    }

    // Nonce 防重放
    const nonce = nonceBuf.toString('hex')
    if (usedNonces.has(nonce)) {
      return { valid: false, reason: 'duplicate nonce (replay attack)' }
    }

    // HMAC 验签
    const signData = Buffer.concat([tsBuf, nonceBuf, devBuf, cmdBuf, payload])
    const expected = crypto.createHmac('sha256', HMAC_KEY).update(signData).digest()

    if (!crypto.timingSafeEqual(signature, expected)) {
      return { valid: false, reason: 'invalid HMAC signature' }
    }

    // 通过 — 记录 nonce
    usedNonces.add(nonce)
    // 定期清理旧 nonce
    if (usedNonces.size > 10000) {
      const arr = [...usedNonces]
      usedNonces.clear()
      for (const n of arr.slice(-5000)) usedNonces.add(n)
    }

    return {
      valid: true,
      deviceId: devBuf.readUInt32BE(0),
      command: cmdBuf.readUInt16BE(0),
    }
  }
}

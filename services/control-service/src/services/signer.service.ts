/**
 * HMAC 指令签名服务
 *
 * 职责（需求文档 4.3.1 & 6.2.1）：
 * 1. 为每个控制指令生成 HMAC-SHA256 签名
 * 2. 指令包结构：timestamp(8B) + nonce(8B) + deviceId(4B) + command(2B) + payload(N) + signature(32B)
 * 3. 防重放：nonce 全局唯一，timestamp 有效期 2000ms
 * 4. 签名密钥预置在网关硬件安全模块中
 */

// TODO: 实现 HMAC-SHA256 签名生成
// TODO: 实现 Nonce 生成器（64位随机数）
// TODO: 实现指令帧序列化（按二进制帧结构打包）
// TODO: 实现签名密钥管理与轮换机制

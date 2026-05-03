/**
 * 协议插件接口定义
 *
 * 职责（需求文档 4.4.2）：
 * 1. 插件化协议适配，支持在不修改主程序的前提下增加新型传感器
 * 2. 通过上传协议驱动包动态加载新协议
 *
 * 已支持协议：
 * - Modbus-RTU (工业标准，RS485 总线)
 * - 预留: OPC UA, MQTT, CAN Bus
 */

// TODO: 定义 IProtocolPlugin 接口（init, read, write, healthCheck）
// TODO: 实现插件注册与发现机制
// TODO: 实现动态加载协议驱动包

/**
 * 浏览器 Critical Alert 强提醒通知
 *
 * 用于 red/yellow 告警时弹出系统级通知，确保运维人员不遗漏。
 * 需用户授予通知权限。未授权或浏览器不支持时静默降级。
 */

import { ref } from 'vue'

const permission = ref<NotificationPermission>('default')
const supported = 'Notification' in window

// 启动时读取当前权限
if (supported) {
  permission.value = Notification.permission
}

export function useNotification() {
  async function requestPermission(): Promise<boolean> {
    if (!supported) return false
    if (permission.value === 'granted') return true
    try {
      const result = await Notification.requestPermission()
      permission.value = result
      return result === 'granted'
    } catch {
      return false
    }
  }

  function notify(title: string, body: string, level: 'red' | 'yellow' | 'green' = 'red') {
    if (!supported || permission.value !== 'granted') return

    const tag = `aqua-alert-${level}`

    // 先关闭同级别的旧通知（防重复弹出）
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // SW 已注册时可用
    }

    const icon = level === 'red' ? '🔴' : level === 'yellow' ? '🟡' : '🟢'
    const vibrate = level === 'red' ? [200, 100, 200] : [100]

    const n = new Notification(`${icon} ${title}`, {
      body,
      tag,
      requireInteraction: level === 'red',
      silent: level === 'green',
    })

    if (navigator.vibrate && level !== 'green') {
      navigator.vibrate(vibrate)
    }

    n.onclick = () => {
      window.focus()
      n.close()
    }

    // 5s 后自动关闭非紧急通知
    if (level !== 'red') {
      setTimeout(() => n.close(), 5000)
    }
  }

  /** 到达移动端告警页时自动请求权限 */
  async function ensurePermission() {
    if (permission.value === 'default') {
      return requestPermission()
    }
    return permission.value === 'granted'
  }

  return { permission, supported, requestPermission, notify, ensurePermission }
}

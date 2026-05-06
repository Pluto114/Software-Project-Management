import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type Role = 'admin' | 'operator' | 'viewer'

export interface UserInfo {
  name: string
  role: Role
  title: string
}

const defaultUsers: Record<Role, UserInfo> = {
  admin: { name: '翁晨昊', role: 'admin', title: 'PM / 架构师' },
  operator: { name: '王涵哲', role: 'operator', title: '现场运维' },
  viewer: { name: '陈鹏翔', role: 'viewer', title: '数据分析师' },
}

export const useAuthStore = defineStore('auth', () => {
  const savedRole = (sessionStorage.getItem('aqua-role') || 'admin') as Role
  const currentRole = ref<Role>(savedRole)
  const user = computed(() => defaultUsers[currentRole.value])

  function setRole(role: Role) {
    currentRole.value = role
    sessionStorage.setItem('aqua-role', role)
  }

  // 各角色可访问的路由
  const roleRouteAccess: Record<Role, string[]> = {
    admin: ['/', '/ai-analysis', '/ceo', '/mobile', '/observability'],
    operator: ['/', '/mobile', '/observability'],
    viewer: ['/ai-analysis', '/ceo', '/observability'],
  }

  function canAccess(path: string): boolean {
    return roleRouteAccess[currentRole.value]?.includes(path) ?? false
  }

  return { currentRole, user, setRole, canAccess, roleRouteAccess }
})

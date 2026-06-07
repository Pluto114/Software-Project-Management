import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type Role = 'admin' | 'manager' | 'operator' | 'analyst' | 'ops'

export interface UserInfo {
  username: string
  name: string
  role: Role
  roleLabel: string
  title: string
  department: string
  scopeLabel: string
  allowedBases: string[]
  homePath: string
  permissions: string[]
}

interface Account extends UserInfo {
  password: string
}

const SESSION_KEY = 'aqua-session'

const accounts: Account[] = [
  {
    username: 'admin',
    password: 'admin123',
    name: '翁晨昊',
    role: 'admin',
    roleLabel: '企业管理员',
    title: '数字化负责人',
    department: '总部管理部',
    scopeLabel: '全部基地与系统配置',
    allowedBases: ['A基地', 'B基地', 'C基地'],
    homePath: '/assets',
    permissions: ['asset:read', 'asset:write', 'asset:delete', 'report:read', 'trend:read', 'ops:read', 'production:read', 'mobile:read'],
  },
  {
    username: 'manager',
    password: 'manager123',
    name: '周慧',
    role: 'manager',
    roleLabel: '养殖部经理',
    title: '生产经理',
    department: '养殖生产部',
    scopeLabel: 'A/B 基地生产与资产',
    allowedBases: ['A基地', 'B基地'],
    homePath: '/',
    permissions: ['asset:read', 'asset:write', 'report:read', 'trend:read', 'production:read'],
  },
  {
    username: 'operator',
    password: 'operator123',
    name: '王涵哲',
    role: 'operator',
    roleLabel: '现场巡检',
    title: 'A基地班组长',
    department: 'A基地现场班组',
    scopeLabel: 'A基地当班池塘',
    allowedBases: ['A基地'],
    homePath: '/mobile',
    permissions: ['production:read', 'mobile:read'],
  },
  {
    username: 'analyst',
    password: 'analyst123',
    name: '陈鹏翔',
    role: 'analyst',
    roleLabel: '经营分析',
    title: '经营分析师',
    department: '经营分析部',
    scopeLabel: '经营报表与趋势数据',
    allowedBases: ['A基地', 'B基地', 'C基地'],
    homePath: '/ceo',
    permissions: ['report:read', 'trend:read'],
  },
  {
    username: 'ops',
    password: 'ops123',
    name: '赵杰瑞',
    role: 'ops',
    roleLabel: '平台运维',
    title: '平台运维工程师',
    department: '信息技术部',
    scopeLabel: '服务状态与链路监控',
    allowedBases: [],
    homePath: '/observability',
    permissions: ['ops:read'],
  },
]

export const routeAccess: Record<Role, string[]> = {
  admin: ['/', '/trend-analysis', '/ceo', '/assets', '/mobile', '/observability'],
  manager: ['/', '/trend-analysis', '/ceo', '/assets'],
  operator: ['/', '/mobile'],
  analyst: ['/trend-analysis', '/ceo'],
  ops: ['/observability'],
}

export const accountOptions: UserInfo[] = accounts.map(({ password: _password, ...user }) => user)

function sanitize(account: Account): UserInfo {
  const { password: _password, ...user } = account
  return user
}

export function getStoredUser(): UserInfo | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { username?: string }
    const account = accounts.find(item => item.username === parsed.username)
    return account ? sanitize(account) : null
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function canRoleAccess(role: Role, path: string): boolean {
  return routeAccess[role]?.includes(path) ?? false
}

export function homePathFor(role: Role): string {
  return accountOptions.find(user => user.role === role)?.homePath || '/'
}

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<UserInfo | null>(getStoredUser())
  const loginError = ref('')

  const isAuthenticated = computed(() => currentUser.value !== null)
  const user = computed(() => currentUser.value)
  const currentRole = computed<Role>(() => currentUser.value?.role || 'operator')
  const homePath = computed(() => currentUser.value?.homePath || '/login')
  const roleLabel = computed(() => currentUser.value?.roleLabel || '未登录')

  async function login(username: string, password: string): Promise<boolean> {
    const normalized = username.trim().toLowerCase()

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalized, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        loginError.value = data.error === 'invalid username or password' ? '账号或密码不正确' : data.error || '登录失败'
        return false
      }

      currentUser.value = data.user as UserInfo
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username: data.user.username, token: data.token, loggedAt: Date.now() }))
      loginError.value = ''
      return true
    } catch {
      loginError.value = '登录服务暂不可用'
      return false
    }
  }

  function logout(): void {
    currentUser.value = null
    sessionStorage.removeItem(SESSION_KEY)
  }

  function canAccess(path: string): boolean {
    return currentUser.value ? canRoleAccess(currentUser.value.role, path) : false
  }

  function hasPermission(permission: string): boolean {
    return currentUser.value?.permissions.includes(permission) ?? false
  }

  function canSeeBase(baseName: string): boolean {
    const bases = currentUser.value?.allowedBases || []
    return bases.length === 0 ? false : bases.includes(baseName)
  }

  function getAuthHeaders(): Record<string, string> {
    if (!currentUser.value) return {}
    return {
      Authorization: `Bearer demo-${currentUser.value.username}`,
      'X-Demo-User': currentUser.value.username,
      'X-Demo-Role': currentUser.value.role,
      'X-Demo-Bases': currentUser.value.allowedBases.map(base => base.replace('基地', '')).join(','),
    }
  }

  return {
    accountOptions,
    currentRole,
    currentUser,
    homePath,
    isAuthenticated,
    login,
    loginError,
    logout,
    roleAccess: routeAccess,
    roleLabel,
    user,
    canAccess,
    canSeeBase,
    getAuthHeaders,
    hasPermission,
  }
})

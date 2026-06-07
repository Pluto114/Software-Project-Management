import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import DigitalTwinDashboard from './views/DigitalTwinDashboard.vue'
import LoginView from './views/LoginView.vue'
import CEODashboard from './views/CEODashboard.vue'
import TechnicianMobile from './views/TechnicianMobile.vue'
import ObservabilityDashboard from './views/ObservabilityDashboard.vue'
import AssetManagement from './views/AssetManagement.vue'
import TrendAnalysis from './views/TrendAnalysis.vue'
import { canRoleAccess, getStoredUser } from './stores/auth'
import './styles/global.css'

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'digital-twin', component: DigitalTwinDashboard, meta: { roles: ['admin', 'manager', 'operator'] } },
  { path: '/trend-analysis', name: 'trend-analysis', component: TrendAnalysis, meta: { roles: ['admin', 'manager', 'analyst'] } },
  { path: '/ceo', name: 'ceo-dashboard', component: CEODashboard, meta: { roles: ['admin', 'manager', 'analyst'] } },
  { path: '/assets', name: 'asset-management', component: AssetManagement, meta: { roles: ['admin', 'manager'] } },
  { path: '/mobile', name: 'technician-mobile', component: TechnicianMobile, meta: { roles: ['admin', 'operator'] } },
  { path: '/observability', name: 'observability', component: ObservabilityDashboard, meta: { roles: ['admin', 'ops'] } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 路由守卫：登录态与岗位权限校验
router.beforeEach((to) => {
  const user = getStoredUser()

  if (to.meta.public) {
    return user ? user.homePath : undefined
  }

  if (!user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (!canRoleAccess(user.role, to.path)) {
    return user.homePath
  }
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

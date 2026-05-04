import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import DigitalTwinDashboard from './views/DigitalTwinDashboard.vue'
import AIAnalysis from './views/AIAnalysis.vue'
import CEODashboard from './views/CEODashboard.vue'
import TechnicianMobile from './views/TechnicianMobile.vue'
import './styles/global.css'

const routes = [
  { path: '/', name: 'digital-twin', component: DigitalTwinDashboard, meta: { roles: ['admin', 'operator'] } },
  { path: '/ai-analysis', name: 'ai-analysis', component: AIAnalysis, meta: { roles: ['admin', 'viewer'] } },
  { path: '/ceo', name: 'ceo-dashboard', component: CEODashboard, meta: { roles: ['admin', 'viewer'] } },
  { path: '/mobile', name: 'technician-mobile', component: TechnicianMobile, meta: { roles: ['admin', 'operator'] } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 路由守卫：角色权限校验 (通过 sessionStorage 共享角色信息)
router.beforeEach((to, _from) => {
  const role = (sessionStorage.getItem('aqua-role') || 'admin') as string
  const allowed = to.meta.roles as string[] | undefined
  if (allowed && !allowed.includes(role)) {
    const fallbacks: Record<string, string> = { admin: '/', operator: '/', viewer: '/ai-analysis' }
    return fallbacks[role] || '/'
  }
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

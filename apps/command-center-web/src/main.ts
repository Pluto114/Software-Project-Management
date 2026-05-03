import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import DigitalTwinDashboard from './views/DigitalTwinDashboard.vue'
import AIAnalysis from './views/AIAnalysis.vue'
import CEODashboard from './views/CEODashboard.vue'
import './styles/global.css'

const routes = [
  { path: '/', name: 'digital-twin', component: DigitalTwinDashboard },
  { path: '/ai-analysis', name: 'ai-analysis', component: AIAnalysis },
  { path: '/ceo', name: 'ceo-dashboard', component: CEODashboard },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

import './assets/tailwind.css'
import './assets/themes.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initTheme } from './utils/theme'
import { initLogger, logPageView } from './utils/logger'

// 在应用启动前初始化主题，确保默认是浅色模式
initTheme()

// 初始化前端日志系统（暂时禁用，避免CORS错误）
initLogger({ enabled: false })

// 初始化系统配置（从环境变量读取租户配置）
function initSystemConfig() {
  try {
    const existingConfig = localStorage.getItem('system_config')
    if (!existingConfig) {
      // 从环境变量读取租户配置，如果没有则使用默认值
      const defaultConfig = {
        tenantId: import.meta.env.VITE_TENANT_ID || 'default-tenant-001',
        tenantKey: import.meta.env.VITE_TENANT_KEY || 'DEFAULT-LICENSE-KEY-001',
        brandName: import.meta.env.VITE_BRAND_NAME || '香蕉AI',
        primaryColor: import.meta.env.VITE_PRIMARY_COLOR || '#FBBF24'
      }
      localStorage.setItem('system_config', JSON.stringify(defaultConfig))
      console.log('[系统初始化] 已从环境变量设置租户配置:', defaultConfig.tenantId)
    } else {
      console.log('[系统初始化] 使用现有租户配置')
    }
  } catch (e) {
    console.error('[系统初始化] 配置初始化失败:', e)
  }
}

initSystemConfig()

// 创建并挂载应用
const app = createApp(App)
app.use(router)

// 路由切换时记录页面访问（暂时禁用）
// router.afterEach((to) => {
//   logPageView(to.path, to.params)
// })

app.mount('#app')

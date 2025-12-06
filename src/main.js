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
    // 从环境变量读取租户配置，如果没有则使用默认值
    const envConfig = {
      tenantId: import.meta.env.VITE_TENANT_ID || 'default-tenant-001',
      tenantKey: import.meta.env.VITE_TENANT_KEY || 'DEFAULT-LICENSE-KEY-001',
      brandName: import.meta.env.VITE_BRAND_NAME || '香蕉AI',
      primaryColor: import.meta.env.VITE_PRIMARY_COLOR || '#FBBF24',
      apiBase: import.meta.env.VITE_API_BASE || ''
    }
    
    const existingConfig = localStorage.getItem('system_config')
    
    if (!existingConfig) {
      // 首次访问，直接设置环境变量的配置
      localStorage.setItem('system_config', JSON.stringify(envConfig))
      console.log('[系统初始化] 首次访问，已设置租户配置:', envConfig.tenantId)
    } else {
      // 已有配置，检查环境变量的租户ID是否变化
      try {
        const parsed = JSON.parse(existingConfig)
        
        // 如果环境变量的租户ID与缓存不同，说明切换了租户，需要更新
        if (parsed.tenantId !== envConfig.tenantId || parsed.tenantKey !== envConfig.tenantKey) {
          console.log(`[系统初始化] 检测到租户变更: ${parsed.tenantId} -> ${envConfig.tenantId}`)
          console.log('[系统初始化] 清除旧配置和登录状态...')
          
          // 清除旧的登录token和用户数据
          localStorage.removeItem('token')
          localStorage.removeItem('tenant_config')
          
          // 更新为新的租户配置
          localStorage.setItem('system_config', JSON.stringify(envConfig))
          console.log('[系统初始化] 已更新为新租户配置:', envConfig.tenantId)
        } else {
          console.log('[系统初始化] 租户配置未变化，继续使用:', parsed.tenantId)
        }
      } catch (e) {
        // 配置解析失败，使用环境变量重新初始化
        console.warn('[系统初始化] 配置解析失败，重新初始化')
        localStorage.setItem('system_config', JSON.stringify(envConfig))
      }
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

import './assets/tailwind.css'
import './assets/themes.css'

// VueFlow 核心样式 - 必须导入以正确渲染连线和图形
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initTheme } from './utils/theme'
import { initLogger, logPageView } from './utils/logger'
import { loadBrandConfig, getBrand } from './config/tenant'

// 在应用启动前初始化主题，确保默认是浅色模式
initTheme()

// 初始化前端日志系统（暂时禁用，避免CORS错误）
initLogger({ enabled: false })

// 初始化系统配置（从环境变量读取租户ID和密钥）
// 注意：品牌配置（名称、Logo、主题色）从API动态获取，不再使用环境变量
function initSystemConfig() {
  try {
    // 只从环境变量读取租户ID和密钥，品牌配置从API获取
    const envConfig = {
      tenantId: import.meta.env.VITE_TENANT_ID || 'default-tenant-001',
      tenantKey: import.meta.env.VITE_TENANT_KEY || 'DEFAULT-LICENSE-KEY-001',
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

// 从API加载品牌配置并应用
async function initBrandConfig() {
  try {
    console.log('[系统初始化] 开始加载品牌配置...')
    const brand = await loadBrandConfig()
    
    // 更新页面标题
    if (brand.name) {
      document.title = brand.name
    }
    
    // favicon 已在 loadBrandConfig 中通过 applyFavicon 自动应用
    
    console.log('[系统初始化] 品牌配置已应用:', brand.name, '主题色:', brand.primaryColor)
  } catch (e) {
    console.error('[系统初始化] 品牌配置加载失败:', e)
  }
}

initSystemConfig()

// 创建并挂载应用
const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// 应用挂载后加载品牌配置
app.mount('#app')

// 异步加载品牌配置（不阻塞应用启动）
initBrandConfig()

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
import { createI18n } from './i18n'

// 在应用启动前初始化主题，确保默认是浅色模式
initTheme()

// 初始化前端日志系统（暂时禁用，避免CORS错误）
initLogger({ enabled: false })

// 初始化系统配置（从环境变量读取租户ID和密钥）
// 注意：品牌配置（名称、Logo、主题色）从API动态获取，不再使用环境变量
// 重要：环境变量的租户配置始终优先，确保前端使用正确的租户ID
function initSystemConfig() {
  try {
    // 只从环境变量读取租户ID和密钥，品牌配置从API获取
    const envConfig = {
      tenantId: import.meta.env.VITE_TENANT_ID || 'default-tenant-001',
      tenantKey: import.meta.env.VITE_TENANT_KEY || 'DEFAULT-LICENSE-KEY-001',
      apiBase: import.meta.env.VITE_API_BASE || ''
    }
    
    const existingConfig = localStorage.getItem('system_config')
    let needUpdate = false
    let oldTenantId = null
    
    if (!existingConfig) {
      // 首次访问
      needUpdate = true
      console.log('[系统初始化] 首次访问')
    } else {
      try {
        const parsed = JSON.parse(existingConfig)
        oldTenantId = parsed.tenantId
        
        // 检查环境变量的租户ID与缓存是否不同
        if (parsed.tenantId !== envConfig.tenantId || parsed.tenantKey !== envConfig.tenantKey) {
          needUpdate = true
          console.log(`[系统初始化] 检测到租户变更: ${parsed.tenantId} -> ${envConfig.tenantId}`)
        }
      } catch (e) {
        needUpdate = true
        console.warn('[系统初始化] 配置解析失败')
      }
    }
    
    // 始终确保 system_config 使用环境变量的配置
    // 这样可以保证每次启动都使用 .env 中配置的租户ID
    localStorage.setItem('system_config', JSON.stringify(envConfig))
    
    if (needUpdate && oldTenantId && oldTenantId !== envConfig.tenantId) {
      console.log('[系统初始化] 清除旧配置和登录状态...')
      // 清除旧的登录token和用户数据
      localStorage.removeItem('token')
      localStorage.removeItem('tenant_config')
      localStorage.removeItem('brand_config_last_update')
    }
    
    console.log('[系统初始化] 当前租户配置:', envConfig.tenantId)
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
app.use(createI18n())

// 应用挂载后加载品牌配置
app.mount('#app')

// 异步加载品牌配置（不阻塞应用启动）
initBrandConfig()

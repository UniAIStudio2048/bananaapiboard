/**
 * 租户配置模块
 * 
 * 配置优先级：
 * 1. 远程配置（从后端 API 加载）- 最高优先级
 * 2. 本地存储配置（localStorage）
 * 3. 环境变量配置
 * 4. 默认配置
 * 
 * 环境变量：
 * - VITE_API_BASE: 后端 API 地址
 * - VITE_TENANT_ID: 租户 ID
 * - VITE_TENANT_KEY: 授权密钥
 * - VITE_BRAND_NAME: 品牌名称
 * - VITE_BRAND_LOGO: Logo URL
 * - VITE_PRIMARY_COLOR: 主色调
 * - VITE_FAVICON: Favicon URL
 */

// 智能检测 API Base URL
function getDefaultApiBase() {
  // 确保在浏览器环境中运行
  if (typeof window === 'undefined') {
    return ''  // SSR 或初始化阶段，返回空字符串
  }
  
  // 统一使用 Vite 代理，不直接访问后端
  // 这样可以避免跨域问题和域名访问问题
  return ''  // 空字符串表示使用 Vite 代理
}

// 默认配置
const defaultConfig = {
  // API 配置
  apiBase: '',  // 初始为空，运行时动态检测
  
  // 租户标识
  tenantId: 'default-tenant-001',
  tenantKey: 'DEFAULT-LICENSE-KEY-001',
  
  // 品牌配置
  brand: {
    name: '香蕉AI',
    logo: '/logo.png',
    favicon: '/favicon.ico',
    primaryColor: '#FBBF24',  // 黄色（香蕉色）
    description: 'AI 图像生成平台'
  },
  
  // 功能开关
  features: {
    enableVideo: true,      // 是否启用视频生成
    enableVoucher: true,    // 是否启用兑换券
    enableInvite: true,     // 是否启用邀请系统
    enablePackages: true    // 是否启用套餐系统
  }
}

// 从环境变量读取配置
const envConfig = {
  apiBase: import.meta.env.VITE_API_BASE || getDefaultApiBase(),
  tenantId: import.meta.env.VITE_TENANT_ID || defaultConfig.tenantId,
  tenantKey: import.meta.env.VITE_TENANT_KEY || defaultConfig.tenantKey,
  brand: {
    name: import.meta.env.VITE_BRAND_NAME || defaultConfig.brand.name,
    logo: import.meta.env.VITE_BRAND_LOGO || defaultConfig.brand.logo,
    favicon: import.meta.env.VITE_FAVICON || defaultConfig.brand.favicon,
    primaryColor: import.meta.env.VITE_PRIMARY_COLOR || defaultConfig.brand.primaryColor,
    description: import.meta.env.VITE_BRAND_DESCRIPTION || defaultConfig.brand.description
  },
  features: {
    enableVideo: import.meta.env.VITE_ENABLE_VIDEO !== 'false',
    enableVoucher: import.meta.env.VITE_ENABLE_VOUCHER !== 'false',
    enableInvite: import.meta.env.VITE_ENABLE_INVITE !== 'false',
    enablePackages: import.meta.env.VITE_ENABLE_PACKAGES !== 'false'
  }
}

// 当前运行时配置（可动态更新）
let runtimeConfig = { ...envConfig }

// 从 localStorage 加载配置
function loadFromStorage() {
  try {
    const stored = localStorage.getItem('tenant_config')
    if (stored) {
      const parsed = JSON.parse(stored)
      console.log('[tenant] 从本地存储加载配置')
      return parsed
    }
  } catch (e) {
    console.error('[tenant] 加载本地配置失败:', e)
  }
  return null
}

// 保存配置到 localStorage
function saveToStorage(config) {
  try {
    localStorage.setItem('tenant_config', JSON.stringify(config))
    console.log('[tenant] 配置已保存到本地存储')
  } catch (e) {
    console.error('[tenant] 保存本地配置失败:', e)
  }
}

// 更新运行时配置（供外部调用）
export function updateRuntimeConfig(newConfig) {
  runtimeConfig = {
    ...runtimeConfig,
    ...newConfig
  }
  console.log('[tenant] 运行时配置已更新:', runtimeConfig)
}

// 从后端 API 加载配置
export async function loadRemoteConfig() {
  try {
    // 如果没有配置 tenantId，使用默认配置
    if (!runtimeConfig.tenantId || runtimeConfig.tenantId === 'default-tenant-001') {
      console.log('[tenant] 使用默认租户配置')
      return runtimeConfig
    }
    
    console.log('[tenant] 从后端加载租户配置...')
    const response = await fetch(`/api/super-admin/tenants/${runtimeConfig.tenantId}/settings`, {
      headers: {
        'X-Tenant-ID': runtimeConfig.tenantId,
        'X-Tenant-Key': runtimeConfig.tenantKey
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log('[tenant] 远程配置加载成功')
      
      // 更新运行时配置
      runtimeConfig = {
        apiBase: data.apiBase || runtimeConfig.apiBase,
        tenantId: data.tenantId || runtimeConfig.tenantId,
        tenantKey: data.tenantKey || runtimeConfig.tenantKey,
        brand: {
          name: data.brandName || runtimeConfig.brand.name,
          logo: data.brandLogo || runtimeConfig.brand.logo,
          favicon: runtimeConfig.brand.favicon,
          primaryColor: data.primaryColor || runtimeConfig.brand.primaryColor,
          description: runtimeConfig.brand.description
        },
        features: runtimeConfig.features
      }
      
      // 保存到本地存储
      saveToStorage(runtimeConfig)
      
      return runtimeConfig
    } else {
      console.warn('[tenant] 远程配置加载失败，使用本地配置')
    }
  } catch (e) {
    console.error('[tenant] 加载远程配置失败:', e)
  }
  
  return runtimeConfig
}

// 初始化：尝试从 localStorage 加载
// 优先从 system_config 读取（系统配置页面设置的）
try {
  const systemConfig = localStorage.getItem('system_config')
  if (systemConfig) {
    const parsed = JSON.parse(systemConfig)
    runtimeConfig = {
      apiBase: parsed.apiBase || envConfig.apiBase,
      tenantId: parsed.tenantId || envConfig.tenantId,
      tenantKey: parsed.tenantKey || envConfig.tenantKey,
      brand: {
        name: parsed.brandName || envConfig.brand.name,
        logo: envConfig.brand.logo,
        favicon: envConfig.brand.favicon,
        primaryColor: parsed.primaryColor || envConfig.brand.primaryColor,
        description: envConfig.brand.description
      },
      features: envConfig.features
    }
    console.log('[tenant] 从系统配置加载')
  } else {
    // 降级到 tenant_config
    const storedConfig = loadFromStorage()
    if (storedConfig) {
      runtimeConfig = { ...envConfig, ...storedConfig }
      console.log('[tenant] 从租户配置加载')
    }
  }
} catch (e) {
  console.error('[tenant] 配置加载失败:', e)
}

// 导出配置（动态引用）
export const config = new Proxy({}, {
  get(target, prop) {
    return runtimeConfig[prop]
  },
  set(target, prop, value) {
    runtimeConfig[prop] = value
    return true
  }
})

// 导出便捷方法
export const getApiBase = () => config.apiBase
export const getTenantId = () => config.tenantId
export const getTenantKey = () => config.tenantKey
export const getBrand = () => config.brand
export const getFeatures = () => config.features

// 生成带租户标识的请求头
export const getTenantHeaders = () => {
  // 每次都重新从localStorage读取，确保最新
  try {
    const systemConfig = localStorage.getItem('system_config')
    if (systemConfig) {
      const parsed = JSON.parse(systemConfig)
      if (parsed.tenantId && parsed.tenantKey) {
        return {
          'X-Tenant-ID': parsed.tenantId,
          'X-Tenant-Key': parsed.tenantKey
        }
      }
    }
  } catch (e) {
    console.warn('[tenant] 读取system_config失败:', e)
  }
  
  // 降级使用内存中的配置，确保使用有效的默认值
  const tenantId = config.tenantId || defaultConfig.tenantId
  const tenantKey = config.tenantKey || defaultConfig.tenantKey
  
  return {
    'X-Tenant-ID': tenantId,
    'X-Tenant-Key': tenantKey
  }
}

// 生成完整的 API URL
export const getApiUrl = (path) => {
  const base = config.apiBase || ''
  return `${base}${path}`
}

export default config


/**
 * 租户配置模块
 * 
 * 配置优先级：
 * 1. 远程品牌配置（从后端 API /api/tenant-portal/brand-config 加载）- 最高优先级
 * 2. 本地存储配置（localStorage）
 * 3. 环境变量配置（仅用于租户ID和密钥）
 * 4. 默认配置
 * 
 * 环境变量：
 * - VITE_API_BASE: 后端 API 地址
 * - VITE_TENANT_ID: 租户 ID
 * - VITE_TENANT_KEY: 授权密钥
 * 
 * 注意：品牌配置（名称、Logo、主题色）从9000端口租户控制台配置，
 * 不再使用 VITE_BRAND_* 环境变量
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
  
  // 品牌配置（默认值，会被远程配置覆盖）
  brand: {
    name: '香蕉AI',
    logo: '/logo.png',
    favicon: '/favicon.ico',
    primaryColor: '#FBBF24',  // 黄色（香蕉色）
    description: 'AI 图像生成平台'
  },
  
  // 模型名称配置（默认为空，使用原始名称）
  modelNames: {
    image: {
      'nano-banana': '',
      'nano-banana-hd': '',
      'nano-banana-2': ''
    },
    video: {
      'sora-2': '',
      'sora-2-pro': '',
      'veo3.1-components': '',
      'veo3.1': '',
      'veo3.1-pro': ''
    }
  },
  
  // 模型启用/禁用配置
  modelEnabled: {
    image: {
      'nano-banana': true,
      'nano-banana-hd': true,
      'nano-banana-2': true
    },
    video: {
      'sora-2': true,
      'sora-2-pro': true,
      'veo3.1-components': true,
      'veo3.1': true,
      'veo3.1-pro': true
    }
  },
  
  // 功能开关
  features: {
    enableVideo: true,      // 是否启用视频生成
    enableVoucher: true,    // 是否启用兑换券
    enableInvite: true,     // 是否启用邀请系统
    enablePackages: true    // 是否启用套餐系统
  }
}

// 从环境变量读取配置（品牌配置不再从环境变量读取）
const envConfig = {
  apiBase: import.meta.env.VITE_API_BASE || getDefaultApiBase(),
  tenantId: import.meta.env.VITE_TENANT_ID || defaultConfig.tenantId,
  tenantKey: import.meta.env.VITE_TENANT_KEY || defaultConfig.tenantKey,
  brand: {
    // 品牌配置使用默认值，启动时会从API加载
    name: defaultConfig.brand.name,
    logo: defaultConfig.brand.logo,
    favicon: defaultConfig.brand.favicon,
    primaryColor: defaultConfig.brand.primaryColor,
    description: defaultConfig.brand.description
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

// 从后端 API 加载品牌配置（公开接口，无需认证）
export async function loadBrandConfig(forceReload = false) {
  try {
    // 检查是否需要强制重新加载
    if (!forceReload) {
      const lastUpdate = localStorage.getItem('brand_config_last_update')
      if (lastUpdate) {
        const timeSinceUpdate = Date.now() - parseInt(lastUpdate)
        // 如果距离上次更新不到5分钟，使用缓存
        if (timeSinceUpdate < 5 * 60 * 1000) {
          console.log('[tenant] 使用缓存的品牌配置')
          return runtimeConfig.brand
        }
      }
    }
    
    console.log('[tenant] 从后端加载品牌配置...')
    
    // 先尝试从 localStorage 获取租户信息
    let tenantId = runtimeConfig.tenantId
    let tenantKey = runtimeConfig.tenantKey
    
    try {
      const systemConfig = localStorage.getItem('system_config')
      if (systemConfig) {
        const parsed = JSON.parse(systemConfig)
        if (parsed.tenantId) tenantId = parsed.tenantId
        if (parsed.tenantKey) tenantKey = parsed.tenantKey
      }
    } catch (e) {
      console.warn('[tenant] 读取system_config失败:', e)
    }
    
    // 调用公开的品牌配置API
    const response = await fetch('/api/tenant-portal/brand-config', {
      headers: {
        'X-Tenant-ID': tenantId,
        'X-Tenant-Key': tenantKey
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log('[tenant] 品牌配置加载成功:', data)
      
      // 更新品牌配置
      runtimeConfig.brand = {
        name: data.brandName || runtimeConfig.brand.name,
        logo: data.brandLogo || runtimeConfig.brand.logo,
        favicon: data.favicon || data.brandLogo || runtimeConfig.brand.favicon,
        primaryColor: data.primaryColor || runtimeConfig.brand.primaryColor,
        description: data.brandDescription || runtimeConfig.brand.description
      }
      
      // 更新模型名称配置
      if (data.modelNames) {
        runtimeConfig.modelNames = data.modelNames
        console.log('[tenant] 模型名称配置已更新:', data.modelNames)
      }
      
      // 更新模型启用/禁用配置
      if (data.modelEnabled) {
        runtimeConfig.modelEnabled = data.modelEnabled
        console.log('[tenant] 模型启用配置已更新:', data.modelEnabled)
      }
      
      // 保存到本地存储
      saveToStorage(runtimeConfig)
      
      // 记录更新时间
      localStorage.setItem('brand_config_last_update', Date.now().toString())
      
      // 应用主题色到CSS变量
      applyThemeColor(runtimeConfig.brand.primaryColor)
      
      // 应用favicon
      applyFavicon(runtimeConfig.brand.favicon)
      
      return runtimeConfig.brand
    } else {
      console.warn('[tenant] 品牌配置加载失败，使用默认配置')
    }
  } catch (e) {
    console.error('[tenant] 加载品牌配置失败:', e)
  }
  
  return runtimeConfig.brand
}

// 将十六进制颜色转换为 RGB 空格分隔格式（用于 Tailwind）
function hexToRgbSpace(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
}

// 应用主题色到CSS变量
function applyThemeColor(color) {
  if (!color || typeof document === 'undefined') return
  
  try {
    document.documentElement.style.setProperty('--primary-color', color)
    // 计算hover颜色（稍微深一点）
    const hoverColor = adjustColor(color, -20)
    document.documentElement.style.setProperty('--primary-color-hover', hoverColor)
    
    // 生成主题色的各种变体并设置 RGB 格式的 CSS 变量
    const variants = [
      { name: '50', amount: 90 },
      { name: '100', amount: 70 },
      { name: '200', amount: 50 },
      { name: '300', amount: 30 },
      { name: '400', amount: 10 },
      { name: '500', amount: 0 },
      { name: '600', amount: -10 },
      { name: '700', amount: -25 },
      { name: '800', amount: -40 },
      { name: '900', amount: -55 },
    ]
    
    for (const v of variants) {
      const adjustedColor = v.amount === 0 ? color : adjustColor(color, v.amount)
      const rgbValue = hexToRgbSpace(adjustedColor)
      if (rgbValue) {
        document.documentElement.style.setProperty(`--primary-${v.name}-rgb`, rgbValue)
      }
    }
    
    console.log('[tenant] 主题色已应用:', color)
  } catch (e) {
    console.error('[tenant] 应用主题色失败:', e)
  }
}

// 应用favicon
function applyFavicon(faviconUrl) {
  if (!faviconUrl || typeof document === 'undefined') return
  
  try {
    // 更新现有的favicon link标签
    let favicon = document.querySelector('link[rel="icon"]')
    if (favicon) {
      favicon.href = faviconUrl
    } else {
      // 如果不存在则创建
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      favicon.href = faviconUrl
      document.head.appendChild(favicon)
    }
    
    // 同时更新 shortcut icon（兼容旧浏览器）
    let shortcutIcon = document.querySelector('link[rel="shortcut icon"]')
    if (shortcutIcon) {
      shortcutIcon.href = faviconUrl
    }
    
    // 更新 apple-touch-icon（移动端）
    let appleIcon = document.querySelector('link[rel="apple-touch-icon"]')
    if (!appleIcon) {
      appleIcon = document.createElement('link')
      appleIcon.rel = 'apple-touch-icon'
      document.head.appendChild(appleIcon)
    }
    appleIcon.href = faviconUrl
    
    console.log('[tenant] Favicon已应用:', faviconUrl)
  } catch (e) {
    console.error('[tenant] 应用Favicon失败:', e)
  }
}

// 调整颜色亮度
function adjustColor(color, amount) {
  const hex = color.replace('#', '')
  const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount))
  const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount))
  const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// 从后端 API 加载配置（旧接口，保留兼容性）
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
      
      // 应用主题色
      applyThemeColor(runtimeConfig.brand.primaryColor)
      
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
export const getModelNames = () => config.modelNames || defaultConfig.modelNames
export const getModelEnabled = () => config.modelEnabled || defaultConfig.modelEnabled

// 获取模型显示名称（如果自定义了则返回自定义名称，否则返回默认名称）
export const getModelDisplayName = (modelKey, type = 'image') => {
  const modelNames = getModelNames()
  const customName = modelNames?.[type]?.[modelKey]
  return customName || null // 返回null表示使用默认名称
}

// 检查模型是否启用
export const isModelEnabled = (modelKey, type = 'image') => {
  const modelEnabled = getModelEnabled()
  return modelEnabled?.[type]?.[modelKey] ?? true // 默认启用
}

// 强制刷新品牌配置（用于管理后台保存后立即刷新）
export const refreshBrandConfig = async () => {
  console.log('[tenant] 强制刷新品牌配置...')
  return await loadBrandConfig(true)
}

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


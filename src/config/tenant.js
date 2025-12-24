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
  
  // 模型描述信息（用于画布模式下拉显示）
  modelDescriptions: {
    image: {},
    video: {}
  },
  
  // 模型积分配置
  modelPricing: {
    image: {},
    video: {}
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
        // 如果距离上次更新不到1分钟，使用缓存（减少缓存时间以便更快同步配置变更）
        if (timeSinceUpdate < 1 * 60 * 1000) {
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
      
      // 更新模型描述配置
      if (data.modelDescriptions) {
        runtimeConfig.modelDescriptions = data.modelDescriptions
        console.log('[tenant] 模型描述配置已更新:', data.modelDescriptions)
      }
      
      // 更新模型积分配置
      if (data.modelPricing) {
        runtimeConfig.modelPricing = data.modelPricing
        console.log('[tenant] 模型积分配置已更新:', data.modelPricing)
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

// 初始化：环境变量的租户ID和密钥优先，其他配置从 localStorage 读取
// 重要：确保前端始终使用 .env 中配置的租户ID
try {
  // 同时读取 tenant_config 获取已保存的模型配置（品牌、模型等）
  const savedTenantConfig = loadFromStorage()
  
  // 环境变量中的租户ID和密钥始终优先
  // 这是多租户隔离的关键：每个租户前端必须使用自己的租户ID
  runtimeConfig = {
    apiBase: envConfig.apiBase,
    tenantId: envConfig.tenantId,  // 始终使用环境变量的租户ID
    tenantKey: envConfig.tenantKey,  // 始终使用环境变量的租户密钥
    brand: {
      name: savedTenantConfig?.brand?.name || envConfig.brand.name,
      logo: savedTenantConfig?.brand?.logo || envConfig.brand.logo,
      favicon: savedTenantConfig?.brand?.favicon || envConfig.brand.favicon,
      primaryColor: savedTenantConfig?.brand?.primaryColor || envConfig.brand.primaryColor,
      description: savedTenantConfig?.brand?.description || envConfig.brand.description
    },
    features: envConfig.features,
    // 模型配置从缓存读取，否则使用默认值
    modelNames: savedTenantConfig?.modelNames || envConfig.modelNames,
    modelEnabled: savedTenantConfig?.modelEnabled || envConfig.modelEnabled,
    modelDescriptions: savedTenantConfig?.modelDescriptions || envConfig.modelDescriptions,
    modelPricing: savedTenantConfig?.modelPricing || defaultConfig.modelPricing
  }
  
  console.log('[tenant] 初始化完成，租户ID:', envConfig.tenantId)
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
export const getModelDescriptions = () => config.modelDescriptions || defaultConfig.modelDescriptions
export const getModelPricing = () => config.modelPricing || defaultConfig.modelPricing

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

// 获取模型描述（如果有则返回描述，否则返回空字符串）
export const getModelDescription = (modelKey, type = 'image') => {
  const modelDescriptions = getModelDescriptions()
  return modelDescriptions?.[type]?.[modelKey] || ''
}

// 获取所有可用的图片模型列表（从配置中动态获取）
export const getAvailableImageModels = () => {
  const modelNames = getModelNames()
  const modelEnabled = getModelEnabled()
  const modelDescriptions = getModelDescriptions()
  const modelPricing = getModelPricing()
  const imageModels = modelNames?.image || {}
  const enabledModels = modelEnabled?.image || {}
  const descriptions = modelDescriptions?.image || {}
  const pricing = modelPricing?.image || {}
  
  // 默认模型配置（当没有任何配置时使用）
  // 注意：description 应从租户管理后台(9000端口)配置，这里默认为空
  const defaultModels = [
    { value: 'nano-banana', label: 'Nano Banana', icon: '🍌', points: 1, description: '', hasResolutionPricing: false, pointsCost: 1 },
    { value: 'nano-banana-hd', label: 'Nano Banana HD', icon: '🍌', points: 3, description: '', hasResolutionPricing: false, pointsCost: 3 },
    { value: 'nano-banana-2', label: 'Nano Banana 2', icon: '🍌', points: null, description: '', hasResolutionPricing: true, pointsCost: { '1k': 3, '2k': 4, '4k': 5 } }
  ]
  
  // 如果配置为空，返回默认模型
  if (Object.keys(imageModels).length === 0) {
    return defaultModels
  }
  
  // 从配置中构建模型列表
  const models = []
  for (const [key, name] of Object.entries(imageModels)) {
    // 只添加启用的模型
    if (enabledModels[key] !== false) {
      const modelPricingConfig = pricing[key] || {}
      models.push({
        value: key,
        label: name || key,
        icon: key.includes('gemini') ? 'G' : '🍌',
        description: descriptions[key] || '',
        // 积分配置
        hasResolutionPricing: modelPricingConfig.hasResolutionPricing || false,
        pointsCost: modelPricingConfig.pointsCost || 1
      })
    }
  }
  
  return models.length > 0 ? models : defaultModels
}

// 获取所有可用的视频模型列表（从配置中动态获取）
export const getAvailableVideoModels = () => {
  // 注意：getVideoModels 函数在当前版本未实现，直接使用 fallback 逻辑
  // 如果将来需要支持新格式配置，可以在这里添加 getVideoModels 函数的实现

  const modelNames = getModelNames()
  const modelEnabled = getModelEnabled()
  const modelDescriptions = getModelDescriptions()
  const modelPricing = getModelPricing()
  const videoModels = modelNames?.video || {}
  const enabledModels = modelEnabled?.video || {}
  const descriptions = modelDescriptions?.video || {}
  const pricing = modelPricing?.video || {}
  
  // 默认模型配置（包含积分配置和描述）- 使用黑白灰图标
  const defaultModelConfig = {
    'sora-2': { label: 'Sora 2', icon: '◆', description: 'OpenAI 旗舰视频生成模型，支持长达 60s 的高清视频', hasDurationPricing: true, pointsCost: { '10': 20, '15': 30 } },
    'sora-2-pro': { label: 'Sora 2 Pro', icon: '★', description: '专业版 Sora 模型，更高分辨率和细节表现', hasDurationPricing: true, pointsCost: { '10': 300, '15': 450, '25': 750 } },
    'veo3.1-components': { label: 'VEO 3.1', icon: '▣', description: 'Google DeepMind 最新视频模型，生成速度快，效果逼真', hasDurationPricing: false, pointsCost: 100 },
    'veo3.1': { label: 'VEO 3.1 标准', icon: '▢', description: '标准版 VEO 模型，适合日常创作', hasDurationPricing: false, pointsCost: 150 },
    'veo3.1-pro': { label: 'VEO 3.1 Pro', icon: '◈', description: '专业版 VEO 模型，支持更复杂的场景和运镜', hasDurationPricing: false, pointsCost: 200 },
    // Kling（可灵）图生视频模型 - 只保留一个 Pro 模式
    'kling-v2-6-pro': { label: 'Kling 2.6 Pro (首尾帧)', icon: '✨', description: '可灵 v2.6 专业版，支持首帧和尾帧控制', hasDurationPricing: true, pointsCost: { '5': 24, '10': 48 }, isImageToVideo: true }
  }
  
  // 转换为数组格式的默认模型列表
  const defaultModels = Object.entries(defaultModelConfig).map(([key, config]) => ({
    value: key,
    ...config
  }))
  
  // 如果配置为空，返回默认模型
  if (Object.keys(videoModels).length === 0) {
    return defaultModels
  }
  
  // 从配置中构建模型列表
  const models = []
  for (const [key, name] of Object.entries(videoModels)) {
    // 只添加启用的模型
    if (enabledModels[key] !== false) {
      const modelPricingConfig = pricing[key] || {}
      const defaultConfig = defaultModelConfig[key] || {}
      
      models.push({
        value: key,
        // 优先使用租户配置的名称，否则使用默认名称
        label: name || defaultConfig.label || key,
        icon: defaultConfig.icon || (key.includes('veo') ? '🎥' : '✨'),
        // 只使用租户配置的描述，为空时不显示（与图像节点保持一致）
        description: descriptions[key] || '',
        // 积分配置：优先使用租户配置，否则使用默认配置
        hasDurationPricing: modelPricingConfig.hasDurationPricing ?? defaultConfig.hasDurationPricing ?? false,
        pointsCost: modelPricingConfig.pointsCost || defaultConfig.pointsCost || 1
      })
    }
  }
  
  return models.length > 0 ? models : defaultModels
}

// 强制刷新品牌配置（用于管理后台保存后立即刷新）
export const refreshBrandConfig = async () => {
  console.log('[tenant] 强制刷新品牌配置...')
  return await loadBrandConfig(true)
}

// 生成带租户标识的请求头
// 重要：始终优先使用环境变量的租户配置，确保多租户隔离
export const getTenantHeaders = () => {
  // 优先使用环境变量的配置（通过 envConfig）
  // 这是在模块加载时从 import.meta.env 读取的
  const tenantId = envConfig.tenantId
  const tenantKey = envConfig.tenantKey
  
  return {
    'X-Tenant-ID': tenantId,
    'X-Tenant-Key': tenantKey
  }
}

// 生成完整的 API URL
export const getApiUrl = (path) => {
  // 在开发环境中，始终使用相对路径（通过 Vite 代理）
  // 这可以避免 CORS 问题
  if (import.meta.env.DEV) {
    return path
  }
  const base = config.apiBase || ''
  return `${base}${path}`
}

export default config



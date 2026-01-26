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

/**
 * 从模型名称/标签中提取首字母或首字作为图标
 * - 英文：取首字母大写
 * - 中文：取首字
 * @param {string} label - 模型显示名称
 * @returns {string} 单个字符用于图标显示
 */
function getModelIconChar(label) {
  if (!label) return '▶'
  
  // 去除空格后取第一个字符
  const firstChar = label.trim()[0]
  if (!firstChar) return '▶'
  
  // 判断是否是中文字符
  const isChinese = /[\u4e00-\u9fa5]/.test(firstChar)
  
  if (isChinese) {
    // 中文直接返回首字
    return firstChar
  } else {
    // 英文返回大写首字母
    return firstChar.toUpperCase()
  }
}

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
  },
  
  // 音乐模型配置
  music_config: {
    models: []  // 从租户端配置获取
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
      
      // 更新完整模型配置（包含 supportedModes，用于前端模式过滤）
      if (data.image_models) {
        runtimeConfig.image_models = data.image_models
        console.log('[tenant] 图片模型完整配置已更新:', data.image_models)
      }
      if (data.video_models) {
        runtimeConfig.video_models = data.video_models
        console.log('[tenant] 视频模型完整配置已更新:', data.video_models)
      }
      
      // 更新 Sora 角色创建配置
      if (data.soraCharacterConfig) {
        runtimeConfig.soraCharacterConfig = data.soraCharacterConfig
        console.log('[tenant] Sora 角色创建配置已更新:', data.soraCharacterConfig)
      }
      
      // 更新 LLM/文本模型配置
      if (data.llm_models) {
        runtimeConfig.llm_models = data.llm_models
        console.log('[tenant] LLM 模型配置已更新:', data.llm_models)
      }
      
      // 更新音乐模型配置
      if (data.music_config) {
        runtimeConfig.music_config = data.music_config
        console.log('[tenant] 音乐模型配置已更新:', data.music_config)
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

// 获取 Sora 角色创建配置（积分消耗等）
export const getSoraCharacterConfig = () => config.soraCharacterConfig || { points_cost: 0 }

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
// mode: 可选参数，'t2i' = 文生图，'i2i' = 图生图，不传则返回所有
export const getAvailableImageModels = (mode = null) => {
  const modelNames = getModelNames()
  const modelEnabled = getModelEnabled()
  const modelDescriptions = getModelDescriptions()
  const modelPricing = getModelPricing()
  const imageModels = modelNames?.image || {}
  const enabledModels = modelEnabled?.image || {}
  const descriptions = modelDescriptions?.image || {}
  const pricing = modelPricing?.image || {}
  
  // 获取新格式的模型配置（包含 supportedModes 和 channels）
  const imageModelsConfig = config.image_models || []
  
  // 默认模型配置（当没有任何配置时使用）
  // 注意：description 应从租户管理后台(9000端口)配置，这里默认为空
  const defaultModels = [
    { value: 'nano-banana', label: 'Nano Banana', icon: '🍌', points: 1, description: '', hasResolutionPricing: false, pointsCost: 1, supportedModes: 'both' },
    { value: 'nano-banana-hd', label: 'Nano Banana HD', icon: '🍌', points: 3, description: '', hasResolutionPricing: false, pointsCost: 3, supportedModes: 'both' },
    { value: 'nano-banana-2', label: 'Nano Banana 2', icon: '🍌', points: null, description: '', hasResolutionPricing: true, pointsCost: { '1k': 3, '2k': 4, '4k': 5 }, supportedModes: 'both' }
  ]
  
  // 根据模式过滤默认模型
  const filterByMode = (models) => {
    if (!mode) return models
    return models.filter(m => {
      const supportedModes = m.supportedModes || 'both'
      return supportedModes === 'both' || supportedModes === mode
    })
  }
  
  // 优先使用 image_models 数组的顺序（保持后端配置的排序）
  if (imageModelsConfig && Array.isArray(imageModelsConfig) && imageModelsConfig.length > 0) {
    const models = []
    
    for (const modelConfig of imageModelsConfig) {
      const key = modelConfig.name
      if (!key) continue
      
      // 跳过禁用的模型
      if (modelConfig.enabled === false || enabledModels[key] === false) continue
      
      const modelPricingConfig = pricing[key] || {}
      const supportedModes = modelConfig.supportedModes || 'both'
      
      // 根据模式过滤
      if (mode) {
        if (mode === 't2i' && supportedModes === 'i2i') continue
        if (mode === 'i2i' && supportedModes === 't2i') continue
      }
      
      models.push({
        value: key,
        label: modelConfig.displayName || imageModels[key] || key,
        icon: key.includes('gemini') ? 'G' : '🍌',
        description: modelConfig.description || descriptions[key] || '',
        // 积分配置
        hasResolutionPricing: modelConfig.hasResolutionPricing || modelPricingConfig.hasResolutionPricing || false,
        pointsCost: modelConfig.pointsCost || modelPricingConfig.pointsCost || 1,
        supportedModes,
        // API 类型（用于判断是否是 MJ 模型）
        apiType: modelConfig.apiType || null
      })
    }
    
    if (models.length > 0) {
      console.log('[tenant] 图片模型列表已按后端配置排序:', models.map(m => m.value))
      return models
    }
  }
  
  // 降级：如果配置为空，返回默认模型
  if (Object.keys(imageModels).length === 0) {
    return filterByMode(defaultModels)
  }
  
  // 从旧格式配置中构建模型列表（不保证顺序）
  const models = []
  for (const [key, name] of Object.entries(imageModels)) {
    // 只添加启用的模型
    if (enabledModels[key] !== false) {
      const modelPricingConfig = pricing[key] || {}
      // 查找新格式配置中的 supportedModes
      const modelFullConfig = imageModelsConfig.find(m => m.name === key || m.id === key)
      const supportedModes = modelFullConfig?.supportedModes || 'both'
      
      // 根据模式过滤
      if (mode) {
        if (mode === 't2i' && supportedModes === 'i2i') continue
        if (mode === 'i2i' && supportedModes === 't2i') continue
      }
      
      models.push({
        value: key,
        label: name || key,
        icon: key.includes('gemini') ? 'G' : '🍌',
        description: descriptions[key] || '',
        // 积分配置
        hasResolutionPricing: modelPricingConfig.hasResolutionPricing || false,
        pointsCost: modelPricingConfig.pointsCost || 1,
        supportedModes
      })
    }
  }
  
  return models.length > 0 ? models : filterByMode(defaultModels)
}

// 获取所有可用的视频模型列表（从配置中动态获取）
// @param {Object} options - 配置选项
// @param {boolean} options.disableVeoMerge - 是否禁用 VEO 模型整合（新手模式需要禁用）
export const getAvailableVideoModels = (options = {}) => {
  const { disableVeoMerge = false } = options
  const modelNames = getModelNames()
  const modelEnabled = getModelEnabled()
  const modelDescriptions = getModelDescriptions()
  const modelPricing = getModelPricing()
  const videoModels = modelNames?.video || {}
  const enabledModels = modelEnabled?.video || {}
  const descriptions = modelDescriptions?.video || {}
  const pricing = modelPricing?.video || {}
  
  // 获取新格式的模型配置（包含 durations、supportedModes 等完整配置）
  const videoModelsConfig = config.video_models || []
  
  // 默认模型配置（包含积分配置和描述）- 图标使用首字母/首字，黑白灰风格
  // 新版 Sora2 整合模型：前端只显示 sora2/sora2-pro，后端自动调度渠道
  const defaultModelConfig = {
    // ==================== 新版 Sora2 整合模型 ====================
    'sora2': { 
      label: 'Sora 2', 
      // 图标使用首字母，样式在组件中定义为黑白灰
      icon: 'S', 
      description: 'OpenAI Sora 视频生成模型，支持文生视频和图生视频', 
      hasDurationPricing: true, 
      pointsCost: { '10': 20, '15': 30 },
      // 支持的时长选项
      durations: ['10', '15'],
      // 支持的方向选项
      aspectRatios: [
        { value: '16:9', label: '横屏 (16:9)' },
        { value: '9:16', label: '竖屏 (9:16)' }
      ],
      // 支持的模式：t2v=文生视频, i2v=图生视频
      supportedModes: { t2v: true, i2v: true, a2v: false }
    },
    'sora2-pro': { 
      label: 'Sora 2 Pro', 
      icon: 'S', 
      description: '专业版 Sora 模型，更高分辨率和细节表现，支持25秒长视频', 
      hasDurationPricing: true, 
      pointsCost: { '10': 300, '15': 450, '25': 750 },
      // Pro 支持 25s
      durations: ['10', '15', '25'],
      aspectRatios: [
        { value: '16:9', label: '横屏 (16:9)' },
        { value: '9:16', label: '竖屏 (9:16)' }
      ],
      supportedModes: { t2v: true, i2v: true, a2v: false }
    },
    // ==================== 旧版 Sora 模型（保持兼容）====================
    'sora-2': { 
      label: 'Sora 2 (旧版)', 
      icon: 'S', 
      description: '旧版 Sora 模型，建议使用新版 Sora 2', 
      hasDurationPricing: true, 
      pointsCost: { '10': 20, '15': 30 },
      durations: ['10', '15'],
      aspectRatios: [{ value: '16:9', label: '横屏 (16:9)' }],
      supportedModes: { t2v: true, i2v: true, a2v: false }
    },
    'sora-2-pro': { 
      label: 'Sora 2 Pro (旧版)', 
      icon: 'S', 
      description: '旧版专业版 Sora 模型', 
      hasDurationPricing: true, 
      pointsCost: { '10': 300, '15': 450, '25': 750 },
      durations: ['10', '15', '25'],
      aspectRatios: [{ value: '16:9', label: '横屏 (16:9)' }],
      supportedModes: { t2v: true, i2v: true, a2v: false }
    },
    // ==================== VEO3 系列（整合入口）====================
    'veo3': { 
      label: 'VEO 3.1', 
      icon: 'V', 
      description: 'Google DeepMind 视频模型，支持多种生成模式和清晰度', 
      hasDurationPricing: false, 
      pointsCost: 100,  // 基础价格，实际按模式计算
      supportedModes: { t2v: true, i2v: true, a2v: false },
      // VEO 特有：支持模式选择
      isVeoModel: true,
      // VEO 模式选项
      veoModes: [
        { value: 'fast', label: 'fast首尾帧', description: '快速生成', actualModel: 'veo3.1-fast', maxImages: 2, pointsCost: 80 },
        { value: 'standard', label: '首尾帧', description: '标准质量', actualModel: 'veo3.1', maxImages: 2, pointsCost: 100 },
        { value: 'components', label: '多图参考', description: '最多3张图', actualModel: 'veo3.1-components', maxImages: 3, pointsCost: 120 },
        { value: 'pro', label: 'Pro首尾帧', description: '最高画质', actualModel: 'veo3.1-pro', maxImages: 2, pointsCost: 150 }
      ],
      // VEO 清晰度选项
      veoResolutions: [
        { value: '1080p', label: '1080P', extraCost: 0 },
        { value: '4k', label: '4K', extraCost: 1 }
      ],
      defaultVeoMode: 'standard',
      defaultVeoResolution: '1080p'
    },
    // 保留独立模型配置用于后端兼容
    'veo3.1-fast': { label: 'VEO 3.1 Fast', icon: 'V', description: '快速生成，首尾帧控制', hasDurationPricing: false, pointsCost: 80, supportedModes: { t2v: true, i2v: true, a2v: false }, hidden: true },
    'veo3.1-components': { label: 'VEO 3.1 多图', icon: 'V', description: '多图参考生成', hasDurationPricing: false, pointsCost: 120, supportedModes: { t2v: true, i2v: true, a2v: false }, hidden: true },
    'veo3.1': { label: 'VEO 3.1 标准', icon: 'V', description: '标准版首尾帧', hasDurationPricing: false, pointsCost: 100, supportedModes: { t2v: true, i2v: true, a2v: false }, hidden: true },
    'veo3.1-pro': { label: 'VEO 3.1 Pro', icon: 'V', description: 'Pro版首尾帧', hasDurationPricing: false, pointsCost: 150, supportedModes: { t2v: true, i2v: true, a2v: false }, hidden: true },
    // ==================== Kling（可灵）图生视频模型 ====================
    'kling-v2-6-pro': { 
      label: 'Kling 2.6 Pro (首尾帧)', 
      icon: 'K', 
      description: '可灵 v2.6 专业版，支持首帧和尾帧控制', 
      hasDurationPricing: true, 
      pointsCost: { '5': 24, '10': 48 }, 
      durations: ['5', '10'],
      isImageToVideo: true,
      supportedModes: { t2v: false, i2v: true, a2v: false }
    }
  }
  
  // 转换为数组格式的默认模型列表（过滤掉 hidden 为 true 的模型）
  const defaultModels = Object.entries(defaultModelConfig)
    .filter(([key, config]) => !config.hidden)
    .map(([key, config]) => ({
      value: key,
      ...config
    }))
  
  // 优先使用 video_models 数组的顺序（保持后端配置的排序）
  // 如果有新格式配置数组，按照数组顺序构建模型列表
  if (videoModelsConfig && Array.isArray(videoModelsConfig) && videoModelsConfig.length > 0) {
    const models = []
    
    // 🔧 VEO 模型整合逻辑：收集所有 VEO 子模型，用于生成模式选项
    // 🆕 区分普通 VEO 和 VEO 4K 组
    const veoSubModels = []      // 普通 VEO 模型（不含 4k）
    const veo4kSubModels = []    // VEO 4K 组（名字包含 4k）
    
    for (const modelConfig of videoModelsConfig) {
      const key = modelConfig.name
      if (!key) continue
      if (modelConfig.enabled === false || enabledModels[key] === false) continue
      
      // 检测 VEO 模型（通过 apiType 或模型名称）
      // 🔧 支持多种命名格式：veo3, veo_3, veo3.1, veo_3_1 等
      const keyLower = key.toLowerCase()
      const displayLower = (modelConfig.displayName || '').toLowerCase()
      const isVeoSubModel = modelConfig.apiType === 'vectorengine' || 
                           keyLower.includes('veo3') ||
                           keyLower.includes('veo_3') ||
                           displayLower.includes('veo')
      
      if (isVeoSubModel) {
        // 🆕 区分 4K 模型和普通模型
        if (key.toLowerCase().includes('4k') || (modelConfig.displayName || '').toLowerCase().includes('4k')) {
          veo4kSubModels.push(modelConfig)
        } else {
          veoSubModels.push(modelConfig)
        }
      }
    }
    
    // VEO 模型处理：如果租户后台配置了子模型则整合，否则使用默认配置
    // 默认 VEO 模式配置（当租户后台未配置时使用）
    // 注意：普通 VEO 模型只支持 1080p，4K 选项已单独作为 VEO 4K 组
    const defaultVeoModes = [
      { value: 'fast', label: 'fast首尾帧', description: '快速生成', actualModel: 'veo3.1-fast', maxImages: 2, pointsCost: 80, supportedResolutions: ['1080p'] },
      { value: 'standard', label: '首尾帧', description: '标准质量', actualModel: 'veo3.1', maxImages: 2, pointsCost: 100, supportedResolutions: ['1080p'] },
      { value: 'components', label: '多图参考', description: '最多3张图', actualModel: 'veo3.1-components', maxImages: 3, pointsCost: 120, supportedResolutions: ['1080p'] },
      { value: 'pro', label: 'Pro首尾帧', description: '最高画质', actualModel: 'veo3.1-pro', maxImages: 2, pointsCost: 150, supportedResolutions: ['1080p'] }
    ]
    
    let finalVeoModes = defaultVeoModes
    let veoPointsCost = 100
    let veoAspectRatios = [{ value: '16:9', label: '横屏 (16:9)' }]
    
    // 🔧 记录第一个 VEO 子模型在原始配置中的位置，用于排序
    let veoInsertIndex = -1
    for (let i = 0; i < videoModelsConfig.length; i++) {
      const m = videoModelsConfig[i]
      if (m.enabled === false) continue
      const mNameLower = (m.name || '').toLowerCase()
      const mDisplayLower = (m.displayName || '').toLowerCase()
      const isVeo = m.apiType === 'vectorengine' || 
                   mNameLower.includes('veo3') ||
                   mNameLower.includes('veo_3') ||
                   mDisplayLower.includes('veo')
      if (isVeo) {
        veoInsertIndex = i
        break
      }
    }
    
    // 如果有 VEO 子模型配置，使用配置的模型覆盖默认
    if (veoSubModels.length > 0) {
      // 动态生成 VEO 模式选项
      const veoModes = veoSubModels.map(m => {
        const name = m.name || ''
        const displayName = m.displayName || m.name || ''
        const pointsCost = typeof m.pointsCost === 'number' ? m.pointsCost : 100
        
        // 根据名称推断模式类型和支持的清晰度
        // 注意：普通 VEO 模型只支持 1080p，4K 选项已单独作为 VEO 4K 组
        let modeValue = 'standard'
        let modeLabel = displayName
        let maxImages = 2
        let supportedResolutions = ['1080p']  // 普通 VEO 只支持 1080p
        
        if (name.includes('fast') || displayName.includes('fast')) {
          modeValue = 'fast'
          modeLabel = 'fast首尾帧'
        } else if (name.includes('components') || displayName.includes('多图') || displayName.includes('参考')) {
          modeValue = 'components'
          modeLabel = '多图参考'
          maxImages = 3
        } else if (name.includes('pro') || displayName.includes('pro') || displayName.includes('Pro')) {
          modeValue = 'pro'
          modeLabel = 'Pro首尾帧'
        } else {
          modeValue = 'standard'
          modeLabel = '首尾帧'
        }
        
        return {
          value: modeValue,
          label: modeLabel,
          description: m.description || '',
          actualModel: name,
          maxImages,
          pointsCost,
          supportedResolutions
        }
      })
      
      // 按模式类型排序：fast -> standard -> components -> pro
      const modeOrder = { fast: 0, standard: 1, components: 2, pro: 3 }
      veoModes.sort((a, b) => (modeOrder[a.value] ?? 99) - (modeOrder[b.value] ?? 99))
      
      // 去重（如果有多个同类型模式，保留第一个）
      const uniqueVeoModes = []
      const seenModes = new Set()
      for (const mode of veoModes) {
        if (!seenModes.has(mode.value)) {
          seenModes.add(mode.value)
          uniqueVeoModes.push(mode)
        }
      }
      
      finalVeoModes = uniqueVeoModes
      veoPointsCost = uniqueVeoModes[0]?.pointsCost || 100
      veoAspectRatios = veoSubModels[0].aspectRatios || veoAspectRatios
      
      console.log('[tenant] VEO 模型已整合（从租户配置），子模型数量:', veoSubModels.length, '模式:', uniqueVeoModes.map(m => m.label))
    } else {
      console.log('[tenant] VEO 模型使用默认配置（租户未配置子模型）')
    }
    
    // 构建 VEO 整合入口（普通 VEO，不含 4K）
    // 注意：4K 选项已移至单独的 VEO 4K 组
    const veoEntry = {
      value: 'veo3',
      label: 'VEO 3.1',
      icon: 'V',
      description: 'Google DeepMind 视频模型，支持多种生成模式',
      hasDurationPricing: false,
      pointsCost: veoPointsCost,
      durations: [],
      aspectRatios: veoAspectRatios,
      supportedModes: { t2v: true, i2v: true, a2v: false },
      apiType: 'vectorengine',
      isVeoModel: true,
      veoModes: finalVeoModes,
      veoResolutions: [
        { value: '1080p', label: '1080P', extraCost: 0 }
      ],
      defaultVeoMode: finalVeoModes[0]?.value || 'standard',
      defaultVeoResolution: '1080p'
    }
    
    // 🆕 构建 VEO 4K 组整合入口
    let veo4kEntry = null
    if (veo4kSubModels.length > 0) {
      // 从 4K 子模型生成模式选项
      const veo4kModes = veo4kSubModels.map(m => {
        const name = m.name || ''
        const nameLower = name.toLowerCase()
        const displayName = m.displayName || m.name || ''
        const displayLower = displayName.toLowerCase()
        const pointsCost = typeof m.pointsCost === 'number' ? m.pointsCost : 8
        
        // 根据名称推断模式类型
        let modeValue = 'standard'
        let modeLabel = '首尾帧'
        let maxImages = 2
        
        // 🆕 先检测 fast-components 组合（fast多图参考）
        const isFast = nameLower.includes('fast') || displayLower.includes('fast')
        const isComponents = nameLower.includes('components') || displayName.includes('多图') || displayName.includes('参考')
        const isPro = nameLower.includes('pro')
        
        if (isFast && isComponents) {
          // fast多图参考
          modeValue = 'fast-components'
          modeLabel = 'fast多图参考'
          maxImages = 3
        } else if (isFast) {
          // fast首尾帧
          modeValue = 'fast'
          modeLabel = 'fast首尾帧'
          maxImages = 2
        } else if (isComponents) {
          modeValue = 'components'
          modeLabel = '多图参考'
          maxImages = 3
        } else if (isPro) {
          modeValue = 'pro'
          modeLabel = 'Pro首尾帧'
        } else {
          modeValue = 'standard'
          modeLabel = '首尾帧'
        }
        
        return {
          value: modeValue,
          label: modeLabel,
          description: m.description || '',
          actualModel: name,
          maxImages,
          pointsCost,
          supportedResolutions: ['4k']  // 4K 组只有 4K 清晰度
        }
      })
      
      // 按模式类型排序：fast -> fast-components -> standard -> components -> pro
      const modeOrder = { fast: 0, 'fast-components': 1, standard: 2, components: 3, pro: 4 }
      veo4kModes.sort((a, b) => (modeOrder[a.value] ?? 99) - (modeOrder[b.value] ?? 99))
      
      // 去重
      const uniqueVeo4kModes = []
      const seenModes4k = new Set()
      for (const mode of veo4kModes) {
        if (!seenModes4k.has(mode.value)) {
          seenModes4k.add(mode.value)
          uniqueVeo4kModes.push(mode)
        }
      }
      
      const veo4kPointsCost = uniqueVeo4kModes[0]?.pointsCost || 8
      const veo4kAspectRatios = veo4kSubModels[0].aspectRatios || [{ value: '16:9', label: '横屏 (16:9)' }]
      
      veo4kEntry = {
        value: 'veo4k',
        label: 'VEO 4K',
        icon: 'V',
        description: 'VEO 3.1 4K 高清版，支持fast首尾帧、fast多图参考、首尾帧、多图参考和Pro模式',
        hasDurationPricing: false,
        pointsCost: veo4kPointsCost,
        durations: [],
        aspectRatios: veo4kAspectRatios,
        supportedModes: { t2v: true, i2v: true, a2v: false },
        apiType: 'vectorengine',
        isVeoModel: true,
        isVeo4k: true,  // 🆕 标记为 VEO 4K 组
        veoModes: uniqueVeo4kModes,
        veoResolutions: [
          { value: '4k', label: '4K', extraCost: 0 }  // 4K 组只有 4K 清晰度，无额外费用
        ],
        defaultVeoMode: uniqueVeo4kModes[0]?.value || 'standard',
        defaultVeoResolution: '4k'
      }
      
      console.log('[tenant] VEO 4K 组已整合，子模型数量:', veo4kSubModels.length, '模式:', uniqueVeo4kModes.map(m => m.label))
    }
    
    // 🔧 按原始配置顺序处理所有模型，在 VEO 位置插入整合入口
    // 遍历原始配置，保持顺序
    let veoInserted = false
    let veo4kInserted = false
    
    for (let i = 0; i < videoModelsConfig.length; i++) {
      const modelConfig = videoModelsConfig[i]
      const key = modelConfig.name
      if (!key) continue
      
      // 跳过禁用的模型
      if (modelConfig.enabled === false || enabledModels[key] === false) continue
      
      // 检测是否是 VEO 子模型
      // 🔧 支持多种命名格式：veo3, veo_3, veo3.1, veo_3_1 等
      const keyLower2 = key.toLowerCase()
      const displayLower2 = (modelConfig.displayName || '').toLowerCase()
      const isVeoSubModel = modelConfig.apiType === 'vectorengine' || 
                           keyLower2.includes('veo3') ||
                           keyLower2.includes('veo_3') ||
                           displayLower2.includes('veo')
      
      // 🆕 检测是否是 VEO 4K 子模型
      const isVeo4kSubModel = isVeoSubModel && (
        key.toLowerCase().includes('4k') || 
        (modelConfig.displayName || '').toLowerCase().includes('4k')
      )
      
      // 🔧 VEO 整合逻辑（仅在未禁用时执行）
      if (!disableVeoMerge) {
        // 🆕 遇到第一个 VEO 4K 子模型时，插入 VEO 4K 整合入口
        if (isVeo4kSubModel && !veo4kInserted && veo4kEntry) {
          models.push(veo4kEntry)
          veo4kInserted = true
          continue  // 跳过 VEO 4K 子模型，不单独显示
        }
        
        // 跳过其他 VEO 4K 子模型
        if (isVeo4kSubModel) continue
        
        // 🔧 遇到第一个普通 VEO 子模型时，插入 VEO 整合入口
        if (isVeoSubModel && !veoInserted && veoSubModels.length > 0) {
          models.push(veoEntry)
          veoInserted = true
          continue  // 跳过 VEO 子模型，不单独显示
        }
        
        // 跳过其他普通 VEO 子模型
        if (isVeoSubModel) continue
      }
      // 🆕 禁用整合时，VEO 子模型会在下面正常添加到列表
      
      const modelPricingConfig = pricing[key] || {}
      const defaultConfig = defaultModelConfig[key] || {}
      
      // 计算时长选项（优先级：新格式配置 durations > 默认配置）
      // 🔧 修复：不再从 pointsCost 提取时长，始终以 durations 配置为准
      const hasDurPricing = modelConfig.hasDurationPricing ?? modelPricingConfig.hasDurationPricing ?? defaultConfig.hasDurationPricing ?? false
      const pCost = modelConfig.pointsCost || modelPricingConfig.pointsCost || defaultConfig.pointsCost || 1
      
      // 优先使用后端配置的 durations，然后是默认配置
      let modelDurations = ['10', '15'] // 最终兜底
      if (modelConfig.durations && Array.isArray(modelConfig.durations) && modelConfig.durations.length > 0) {
        // 使用后端配置的 durations（确保为字符串格式）
        modelDurations = modelConfig.durations.map(d => String(d))
      } else if (defaultConfig.durations && defaultConfig.durations.length > 0) {
        // 使用默认配置的 durations
        modelDurations = defaultConfig.durations.map(d => String(d))
      }
      // 注意：不再从 pointsCost 提取时长，因为 pointsCost 可能包含历史遗留的计费键
      
      // 获取新格式配置中的 aspectRatios 和 supportedModes
      // 兼容两种格式：字符串数组或对象数组
      let aspectRatios = modelConfig.aspectRatios || defaultConfig.aspectRatios || [{ value: '16:9', label: '横屏 (16:9)' }]
      if (Array.isArray(aspectRatios) && aspectRatios.length > 0) {
        aspectRatios = aspectRatios.map(ar => {
          if (typeof ar === 'string') {
            // 字符串转对象格式
            const labelMap = {
              '16:9': '横屏 (16:9)',
              '9:16': '竖屏 (9:16)',
              '1:1': '方形 (1:1)',
              '4:3': '4:3',
              '3:4': '3:4'
            }
            return { value: ar, label: labelMap[ar] || ar }
          }
          return ar
        })
      }
      const supportedModes = modelConfig.supportedModes || defaultConfig.supportedModes || { t2v: true, i2v: true, a2v: false }
      
      // 计算显示名称
      const displayLabel = modelConfig.displayName || videoModels[key] || defaultConfig.label || key
      
      // 跳过隐藏的模型（如 VEO 子模型）
      // 🔧 当禁用 VEO 整合时，不跳过 VEO 子模型
      if (defaultConfig.hidden && !disableVeoMerge) continue
      
      models.push({
        value: key,
        // 优先使用租户配置的名称,否则使用默认名称
        label: displayLabel,
        // 图标使用首字母/首字（黑白灰风格）
        icon: defaultConfig.icon || getModelIconChar(displayLabel),
        // 只使用租户配置的描述，为空时不显示
        description: modelConfig.description || descriptions[key] || '',
        // 积分配置
        hasDurationPricing: hasDurPricing,
        pointsCost: pCost,
        // 时长选项
        durations: modelDurations,
        aspectRatios,
        supportedModes,
        isImageToVideo: modelConfig.isImageToVideo ?? defaultConfig.isImageToVideo ?? false,
        // Vidu 错峰模式折扣（从后端配置读取）
        offPeakDiscount: modelConfig.offPeakDiscount,
        // Vidu 720P清晰度折扣（从后端配置读取）
        resolution720Discount: modelConfig.resolution720Discount,
        // API 类型（用于判断是否是 Vidu 模型）
        apiType: modelConfig.apiType,
        // 可灵动作迁移按秒计费配置（用于前端显示积分消耗）
        costPerSecond: modelConfig.costPerSecond,
        // VEO 模型特有属性
        isVeoModel: defaultConfig.isVeoModel,
        veoModes: defaultConfig.veoModes,
        veoResolutions: defaultConfig.veoResolutions,
        defaultVeoMode: defaultConfig.defaultVeoMode,
        defaultVeoResolution: defaultConfig.defaultVeoResolution
      })
    }
    
    // 如果没有 VEO 子模型配置，但需要显示默认 VEO，添加到末尾
    // 🔧 仅在未禁用整合时添加
    if (!veoInserted && !disableVeoMerge) {
      models.push(veoEntry)
    }
    
    if (models.length > 0) {
      console.log('[tenant] 视频模型列表已按后端配置排序:', models.map(m => m.value))
      return models
    }
  }
  
  // 降级：如果没有新格式配置，使用旧格式 modelNames 对象
  if (Object.keys(videoModels).length === 0) {
    return defaultModels
  }
  
  // 从旧格式配置中构建模型列表（不保证顺序）
  const models = []
  for (const [key, name] of Object.entries(videoModels)) {
    // 只添加启用的模型
    if (enabledModels[key] !== false) {
      const modelPricingConfig = pricing[key] || {}
      const defaultConfig = defaultModelConfig[key] || {}
      
      // 查找新格式配置
      const modelFullConfig = videoModelsConfig.find(m => m.name === key || m.id === key) || {}
      
      // 计算时长选项（优先级：后端配置 > 默认配置）
      // 🔧 修复：不再从 pointsCost 提取时长
      const hasDurPricing = modelPricingConfig.hasDurationPricing ?? defaultConfig.hasDurationPricing ?? false
      const pCost = modelPricingConfig.pointsCost || defaultConfig.pointsCost || 1
      
      let modelDurations = ['10', '15'] // 最终兜底
      if (modelFullConfig.durations && Array.isArray(modelFullConfig.durations) && modelFullConfig.durations.length > 0) {
        modelDurations = modelFullConfig.durations.map(d => String(d))
      } else if (defaultConfig.durations && defaultConfig.durations.length > 0) {
        modelDurations = defaultConfig.durations.map(d => String(d))
      }
      
      // 兼容两种格式：字符串数组或对象数组
      let aspectRatios = modelFullConfig.aspectRatios || defaultConfig.aspectRatios || [{ value: '16:9', label: '横屏 (16:9)' }]
      if (Array.isArray(aspectRatios) && aspectRatios.length > 0) {
        aspectRatios = aspectRatios.map(ar => {
          if (typeof ar === 'string') {
            const labelMap = {
              '16:9': '横屏 (16:9)',
              '9:16': '竖屏 (9:16)',
              '1:1': '方形 (1:1)',
              '4:3': '4:3',
              '3:4': '3:4'
            }
            return { value: ar, label: labelMap[ar] || ar }
          }
          return ar
        })
      }
      const supportedModes = modelFullConfig.supportedModes || defaultConfig.supportedModes || { t2v: true, i2v: true, a2v: false }
      
      models.push({
        value: key,
        label: name || defaultConfig.label || key,
        icon: defaultConfig.icon || (key.includes('veo') ? '🎥' : '✨'),
        description: descriptions[key] || '',
        hasDurationPricing: hasDurPricing,
        pointsCost: pCost,
        durations: modelDurations,
        aspectRatios,
        supportedModes,
        isImageToVideo: modelFullConfig.isImageToVideo ?? defaultConfig.isImageToVideo ?? false,
        // Vidu 错峰模式折扣（从后端配置读取）
        offPeakDiscount: modelFullConfig.offPeakDiscount,
        // Vidu 720P清晰度折扣（从后端配置读取）
        resolution720Discount: modelFullConfig.resolution720Discount,
        // API 类型（用于判断是否是 Vidu 模型）
        apiType: modelFullConfig.apiType,
        // 可灵动作迁移按秒计费配置（用于前端显示积分消耗）
        costPerSecond: modelFullConfig.costPerSecond
      })
    }
  }
  
  return models.length > 0 ? models : defaultModels
}

// 获取所有可用的 LLM/文本模型列表（从配置中动态获取）
export const getAvailableLLMModels = () => {
  // 获取租户配置的 LLM 模型列表
  const llmModelsConfig = config.llm_models || []
  
  // 默认模型配置（当没有任何配置时使用）
  const defaultModels = [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5', icon: 'G', provider: 'google', pointsCost: 1 },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', icon: 'G', provider: 'google', pointsCost: 2 },
    { id: 'gpt-4o', name: 'GPT-4o', icon: 'O', provider: 'openai', pointsCost: 3 },
    { id: 'claude-3', name: 'Claude 3', icon: 'C', provider: 'anthropic', pointsCost: 2 }
  ]
  
  // 如果有租户配置，使用租户配置的模型
  if (llmModelsConfig && Array.isArray(llmModelsConfig) && llmModelsConfig.length > 0) {
    const models = []
    
    for (const modelConfig of llmModelsConfig) {
      // 跳过禁用的模型
      if (modelConfig.enabled === false) continue
      
      models.push({
        id: modelConfig.id,
        value: modelConfig.id, // 兼容前端选择器
        name: modelConfig.name,
        label: modelConfig.name, // 兼容前端选择器
        icon: modelConfig.icon || 'G',
        provider: modelConfig.provider || 'google',
        pointsCost: modelConfig.pointsCost || 1
      })
    }
    
    if (models.length > 0) {
      console.log('[tenant] LLM 模型列表已加载:', models.map(m => m.id))
      return models
    }
  }
  
  // 降级：返回默认模型
  return defaultModels.map(m => ({
    ...m,
    value: m.id,
    label: m.name
  }))
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

// 获取所有可用的音乐模型列表（从配置中动态获取）
export const getAvailableMusicModels = () => {
  // 获取音乐配置
  const musicConfig = config.music_config || {}
  const models = musicConfig.models || []

  // 默认模型配置（当没有配置时使用）
  const defaultModels = [
    {
      id: 'chirp-v4',
      name: 'Chirp V4',
      description: '最新版本，音质更佳',
      pointsCost: 20,
      icon: '♫'
    },
    {
      id: 'chirp-v3-5',
      name: 'Chirp V3.5',
      description: '稳定版本',
      pointsCost: 15,
      icon: '♪'
    }
  ]

  // 如果有租户配置的模型，使用租户配置
  if (models.length > 0) {
    return models.map(model => ({
      value: model.id,
      label: model.name,
      icon: model.icon || '♫',
      description: model.description || '',
      pointsCost: model.pointsCost || 20
    }))
  }

  // 否则返回默认模型
  return defaultModels.map(model => ({
    value: model.id,
    label: model.name,
    icon: model.icon,
    description: model.description,
    pointsCost: model.pointsCost
  }))
}

export default config



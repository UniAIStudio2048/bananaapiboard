/**
 * i18n 国际化配置
 * 支持语言：中文简体、中文繁体、English、日本語、한국어、Español、Français、Deutsch、Русский、العربية、Português
 */

import { reactive, ref, computed, watch } from 'vue'

// 语言代码到显示名称的映射
export const LANGUAGES = {
  'zh-CN': { name: '中文', nativeName: '中文' },
  'zh-TW': { name: '中文繁體', nativeName: '中文繁體' },
  'en': { name: 'English', nativeName: 'English' },
  'ja': { name: '日本語', nativeName: '日本語' },
  'ko': { name: '한국어', nativeName: '한국어' },
  'es': { name: 'Español', nativeName: 'Español' },
  'fr': { name: 'Français', nativeName: 'Français' },
  'de': { name: 'Deutsch', nativeName: 'Deutsch' },
  'ru': { name: 'Русский', nativeName: 'Русский' },
  'ar': { name: 'العربية', nativeName: 'العربية' },
  'pt': { name: 'Português', nativeName: 'Português' }
}

// 语言代码列表
export const LANGUAGE_CODES = Object.keys(LANGUAGES)

// 默认语言
const DEFAULT_LANGUAGE = 'zh-CN'

// 当前语言
const currentLanguage = ref(getInitialLanguage())

// 翻译数据缓存
const translations = reactive({})

// 翻译版本号 - 每次加载新语言包时递增，确保使用 t() 的组件能响应式更新
const translationVersion = ref(0)

// 已加载的语言
const loadedLanguages = new Set()

// 获取初始语言
function getInitialLanguage() {
  // 1. 优先从 localStorage 获取用户选择的语言
  const savedLang = localStorage.getItem('language')
  if (savedLang && LANGUAGE_CODES.includes(savedLang)) {
    return savedLang
  }
  
  // 2. 检测浏览器语言
  const browserLang = navigator.language || navigator.userLanguage
  
  // 精确匹配
  if (LANGUAGE_CODES.includes(browserLang)) {
    return browserLang
  }
  
  // 前缀匹配（如 zh-HK 匹配 zh-TW）
  const langPrefix = browserLang.split('-')[0]
  const matchedLang = LANGUAGE_CODES.find(code => code.startsWith(langPrefix))
  if (matchedLang) {
    return matchedLang
  }
  
  // 3. 默认使用中文简体
  return DEFAULT_LANGUAGE
}

// 动态导入语言文件
async function loadLanguageModule(lang) {
  if (loadedLanguages.has(lang)) {
    return translations[lang]
  }
  
  try {
    const module = await import(`./locales/${lang}.js`)
    translations[lang] = module.default
    loadedLanguages.add(lang)
    translationVersion.value++
    console.log(`[i18n] 语言包已加载: ${lang}`)
    return module.default
  } catch (error) {
    console.error(`[i18n] 加载语言包失败: ${lang}`, error)
    // 回退到默认语言
    if (lang !== DEFAULT_LANGUAGE) {
      return loadLanguageModule(DEFAULT_LANGUAGE)
    }
    return {}
  }
}

// 初始化 - 加载当前语言
async function initI18n() {
  await loadLanguageModule(currentLanguage.value)
  // 预加载默认语言作为回退
  if (currentLanguage.value !== DEFAULT_LANGUAGE) {
    await loadLanguageModule(DEFAULT_LANGUAGE)
  }
}

// 切换语言
async function setLanguage(lang) {
  if (!LANGUAGE_CODES.includes(lang)) {
    console.warn(`[i18n] 不支持的语言: ${lang}`)
    return false
  }
  
  await loadLanguageModule(lang)
  currentLanguage.value = lang
  localStorage.setItem('language', lang)
  
  // 设置 HTML lang 属性
  document.documentElement.lang = lang
  
  // 设置文本方向（阿拉伯语从右到左）
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  
  // 触发全局事件，通知其他组件语言已更改
  window.dispatchEvent(new CustomEvent('language-changed', { detail: lang }))
  
  console.log(`[i18n] 语言已切换到: ${lang}`)
  return true
}

// 获取翻译文本
function t(key, params = {}) {
  // 访问版本号以建立响应式依赖，确保语言包加载后触发重新渲染
  const _v = translationVersion.value
  const lang = currentLanguage.value
  const fallbackLang = DEFAULT_LANGUAGE
  
  // 获取翻译
  let text = getNestedValue(translations[lang], key)
  
  // 如果当前语言没有该翻译，使用默认语言
  if (text === undefined && lang !== fallbackLang) {
    text = getNestedValue(translations[fallbackLang], key)
  }
  
  // 如果仍然没有翻译，返回 key 本身
  if (text === undefined) {
    console.warn(`[i18n] 缺少翻译: ${key} (${lang})`)
    return key
  }
  
  // 替换参数 {0}, {1}, {name} 等
  if (typeof text === 'string' && Object.keys(params).length > 0) {
    text = text.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey] !== undefined ? params[paramKey] : match
    })
  }
  
  return text
}

// 获取嵌套对象的值
function getNestedValue(obj, path) {
  if (!obj) return undefined
  
  const keys = path.split('.')
  let value = obj
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return undefined
    }
  }
  
  return value
}

// 格式化日期
function formatDate(date, format = 'short') {
  const lang = currentLanguage.value
  const d = new Date(date)
  
  const options = {
    short: { month: 'short', day: 'numeric' },
    long: { year: 'numeric', month: 'long', day: 'numeric' },
    full: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  }
  
  return d.toLocaleDateString(lang, options[format] || options.short)
}

// 格式化数字
function formatNumber(num, options = {}) {
  const lang = currentLanguage.value
  return new Intl.NumberFormat(lang, options).format(num)
}

// 判断是否是 RTL 语言
const isRTL = computed(() => currentLanguage.value === 'ar')

// 导出
export {
  currentLanguage,
  initI18n,
  setLanguage,
  t,
  formatDate,
  formatNumber,
  isRTL
}

// 创建 Vue 插件
export function createI18n() {
  return {
    install(app) {
      // 注意：initI18n() 由 main.js 在挂载前 await 调用，此处不再重复调用

      // 全局属性
      app.config.globalProperties.$t = t
      app.config.globalProperties.$language = currentLanguage
      app.config.globalProperties.$setLanguage = setLanguage
      app.config.globalProperties.$isRTL = isRTL
      
      // 提供给 Composition API 使用
      app.provide('i18n', {
        t,
        currentLanguage,
        setLanguage,
        isRTL,
        formatDate,
        formatNumber,
        LANGUAGES,
        LANGUAGE_CODES
      })
    }
  }
}

// Composition API hook
export function useI18n() {
  return {
    t,
    currentLanguage,
    setLanguage,
    isRTL,
    formatDate,
    formatNumber,
    LANGUAGES,
    LANGUAGE_CODES
  }
}

export default {
  install: createI18n().install
}


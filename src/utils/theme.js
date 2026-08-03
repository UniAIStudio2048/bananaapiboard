/**
 * 主题管理工具
 * 统一管理多种主题模式切换
 */

// 主题配置
export const themes = {
  light: {
    id: 'light',
    name: '浅色模式',
    description: '适合白天使用',
    icon: '☀️',
    isDark: false,
    colors: {
      bg: '#ffffff',
      text: '#1e293b',
      primary: '#3b82f6',
    }
  },
  dark: {
    id: 'dark',
    name: '深色模式',
    description: '适合夜晚使用',
    icon: '🌙',
    isDark: true,
    colors: {
      bg: '#0f172a',
      text: '#f1f5f9',
      primary: '#60a5fa',
    }
  }
}

/**
 * 获取当前主题
 * @returns {string} 主题ID
 */
export function getTheme() {
  // 优先从localStorage读取
  const stored = localStorage.getItem('theme')
  if (stored && themes[stored]) {
    return stored
  }
  // 如果没有存储，默认返回浅色模式
  return 'light'
}

/**
 * 设置主题
 * @param {string} themeId 主题ID
 */
export function setTheme(themeId) {
  if (!themes[themeId]) {
    console.warn('Invalid theme, defaulting to light')
    themeId = 'light'
  }
  
  const theme = themes[themeId]
  
  // 保存到localStorage
  localStorage.setItem('theme', themeId)
  
  // 应用到document
  const html = document.documentElement
  
  // 移除所有主题类
  Object.keys(themes).forEach(id => {
    html.classList.remove(`theme-${id}`)
  })
  
  // 添加新主题类
  html.classList.add(`theme-${themeId}`)
  
  // 兼容旧的dark模式
  if (theme.isDark) {
    html.classList.add('dark')
  } else {
    html.classList.remove('dark')
  }
  
  // 设置CSS变量
  html.style.setProperty('--theme-bg', theme.colors.bg)
  html.style.setProperty('--theme-text', theme.colors.text)
  html.style.setProperty('--theme-primary', theme.colors.primary)
  
  // 触发自定义事件，通知其他组件主题已变化
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: themeId } }))
}

/**
 * 切换主题（light/dark切换）
 * @returns {string} 新的主题
 */
export function toggleTheme() {
  const current = getTheme()
  const currentTheme = themes[current]
  // 在浅色和深色主题之间切换
  const newTheme = currentTheme.isDark ? 'light' : 'dark'
  setTheme(newTheme)
  return newTheme
}

/**
 * 初始化主题（在应用启动时调用）
 */
export function initTheme() {
  const theme = getTheme()
  setTheme(theme)
}


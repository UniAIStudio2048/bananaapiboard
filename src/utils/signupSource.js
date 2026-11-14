import { t as translateUi } from '../i18n/index.js'
// 注册来源：首次访问时从 URL 捕获（first touch wins），注册时随请求提交 signup_source
const STORAGE_KEY = 'nb_signup_source'
const QUERY_KEYS = ['utm_source', 'from', 'src']

export const SIGNUP_SOURCE_LABEL = translateUi('uiMessages.maf70f9fc9816')

export const SIGNUP_SOURCE_OPTIONS = [
  { value: 'douyin', get label() { return translateUi('uiMessages.md077d0b18e19') } },
  { value: 'xianyu', get label() { return translateUi('uiMessages.m6586c26399cf') } },
  { value: 'xiaohongshu', get label() { return translateUi('uiMessages.md26c6a08a591') } },
  { value: 'bilibili', get label() { return translateUi('uiMessages.macfb839ad1e4') } },
  { value: 'friend', get label() { return translateUi('uiMessages.m783a119b9763') } },
  { value: 'search', get label() { return translateUi('uiMessages.m82cbe72ab9d9') } },
  { value: 'other', get label() { return translateUi('uiMessages.md2909f1647e7') } }
]

export function sanitizeSignupSource(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 64)
}

export function captureSignupSource(search = globalThis.location?.search || '') {
  try {
    if (globalThis.localStorage.getItem(STORAGE_KEY)) return
    const params = new URLSearchParams(search)
    const key = QUERY_KEYS.find(k => params.get(k))
    const source = key ? sanitizeSignupSource(params.get(key)) : ''
    if (source) globalThis.localStorage.setItem(STORAGE_KEY, source)
  } catch {
    // 存储不可用时忽略
  }
}

export function getSignupSource() {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

// 下拉框初始值：已捕获来源命中选项时预选
export function initialSignupSourceChoice() {
  const source = getSignupSource()
  return SIGNUP_SOURCE_OPTIONS.some(option => option.value === source) ? source : ''
}

// 提交值：优先用户选择，其次 URL 捕获来源，都没有返回空字符串（调用方省略字段）
export function resolveSignupSource(selected) {
  return sanitizeSignupSource(selected) || getSignupSource()
}

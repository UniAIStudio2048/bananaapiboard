// 注册来源：首次访问时从 URL 捕获（first touch wins），注册时随请求提交 signup_source
const STORAGE_KEY = 'nb_signup_source'
const QUERY_KEYS = ['utm_source', 'from', 'src']

export const SIGNUP_SOURCE_LABEL = '你从哪里知道我们？（选填）'

export const SIGNUP_SOURCE_OPTIONS = [
  { value: 'douyin', label: '抖音' },
  { value: 'xianyu', label: '闲鱼' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'bilibili', label: 'B站' },
  { value: 'friend', label: '朋友推荐' },
  { value: 'search', label: '搜索引擎' },
  { value: 'other', label: '其他' }
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

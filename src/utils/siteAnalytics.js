// 访客统计埋点：每次路由切换上报一次 PV 到 /api/analytics/collect，租户后台「访客统计」页查看。
// 访客 ID / 会话 ID 只存在本地用于去重（不是业务数据），访问记录由后端直接写库。
const VISITOR_KEY = 'nb_vid'
const SESSION_KEY = 'nb_sid'
const SESSION_IDLE_MS = 30 * 60 * 1000

function randomId(prefix) {
  const raw = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  return `${prefix}_${raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)}`
}

function safeGet(storage, key) {
  try { return storage?.getItem(key) ?? null } catch { return null }
}

function safeSet(storage, key, value) {
  try { storage?.setItem(key, value) } catch { /* 隐私模式等存储不可用时忽略 */ }
}

export function resolveSession(stored, now, makeId = () => randomId('s')) {
  try {
    const parsed = stored ? JSON.parse(stored) : null
    if (parsed?.id && now - Number(parsed.lastAt) < SESSION_IDLE_MS) return { id: parsed.id, lastAt: now, isEntry: false }
  } catch { /* 损坏的会话记录按新会话处理 */ }
  return { id: makeId(), lastAt: now, isEntry: true }
}

export function readUtm(query = {}) {
  const pick = key => (typeof query[key] === 'string' ? query[key].slice(0, 100) : '')
  return { us: pick('utm_source'), um: pick('utm_medium'), uc: pick('utm_campaign') }
}

export function installSiteAnalytics(router, {
  send,
  storage = globalThis.localStorage,
  now = Date.now,
  doc = globalThis.document,
  loc = globalThis.location,
  defer = fn => setTimeout(fn, 0)
} = {}) {
  if (typeof send !== 'function' || globalThis.navigator?.webdriver) return
  let first = true

  router.afterEach((to, from, failure) => {
    if (failure) return
    if (!first && to.path === from?.path) return
    first = false

    // 等页面标题在路由守卫/组件里更新后再取
    defer(() => {
      const t = now()
      let visitorId = safeGet(storage, VISITOR_KEY)
      const isNewVisitor = !visitorId
      if (!visitorId) {
        visitorId = randomId('v')
        safeSet(storage, VISITOR_KEY, visitorId)
      }
      const session = resolveSession(safeGet(storage, SESSION_KEY), t)
      const isEntry = session.isEntry
      safeSet(storage, SESSION_KEY, JSON.stringify({ id: session.id, lastAt: session.lastAt }))
      const utm = isEntry ? readUtm(to.query) : { us: '', um: '', uc: '' }

      try {
        send({
          v: visitorId,
          s: session.id,
          e: isEntry,
          n: isEntry && isNewVisitor,
          p: to.path,
          t: String(doc?.title || '').slice(0, 200),
          r: isEntry ? String(doc?.referrer || '') : '',
          h: loc?.host || '',
          ...utm
        })
      } catch { /* 上报失败不影响页面 */ }
    })
  })
}

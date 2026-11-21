import { VISITOR_KEY } from './siteAnalytics.js'

const STORAGE_KEY = 'nb_signup_attribution'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const CLICK_PARAMS = ['gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid']
let firstTouch

function readStored(storage, now) {
  try {
    const stored = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null') || firstTouch
    if (stored && now >= stored.at && now - stored.at < MAX_AGE_MS) return stored
  } catch {
    if (firstTouch && now - firstTouch.at < MAX_AGE_MS) return firstTouch
  }
  return null
}

function hasSource(entry) {
  return Boolean(entry.referrer || entry.source || entry.medium || entry.paidClick)
}

export function captureSignupSource({
  href = globalThis.location?.href,
  referrer = globalThis.document?.referrer,
  storage = globalThis.localStorage,
  now = Date.now()
} = {}) {
  if (!href) return
  const url = new URL(href)
  if (url.pathname === '/wechat/callback') return
  const previous = readStored(storage, now)
  if (previous && hasSource(previous)) return

  let externalOrigin = ''
  try {
    const incoming = new URL(referrer)
    if (/^https?:$/.test(incoming.protocol) && incoming.hostname !== url.hostname) externalOrigin = incoming.origin
  } catch {}
  const params = url.searchParams
  const source = ['utm_source', 'from', 'src'].map(key => params.get(key)).find(Boolean) || ''
  const entry = {
    at: now,
    origin: url.origin,
    referrer: externalOrigin,
    source: source.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 64),
    medium: (params.get('utm_medium') || '').trim().slice(0, 64),
    campaign: (params.get('utm_campaign') || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 64),
    landingPath: url.pathname.slice(0, 255),
    paidClick: CLICK_PARAMS.some(key => Boolean(params.get(key)))
  }
  if (previous?.landingPath && !hasSource(entry)) return
  firstTouch = entry
  try {
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(entry))
      firstTouch = undefined
    }
  } catch {}
}

export function getSignupAttribution(storage = globalThis.localStorage, now = Date.now()) {
  const entry = readStored(storage, now)
  if (!entry) return null
  const { origin, referrer, source, medium, paidClick, campaign, landingPath } = entry
  let visitorId = null
  try { visitorId = storage?.getItem(VISITOR_KEY) || null } catch {}
  return {
    origin, referrer, source, medium, paidClick, visitorId,
    ...(campaign ? { campaign } : {}),
    ...(landingPath ? { landingPath } : {})
  }
}

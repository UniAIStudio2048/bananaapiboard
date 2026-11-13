import assert from 'node:assert/strict'
import { installSiteAnalytics, resolveSession, readUtm } from './siteAnalytics.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v) }, data }
}

function fakeRouter() {
  const hooks = []
  return { afterEach: fn => hooks.push(fn), go: (to, from, failure) => hooks.forEach(fn => fn(to, from, failure)) }
}

const route = (path, query = {}) => ({ path, fullPath: path, query })
const START = { path: '/', fullPath: '/', query: {}, matched: [] }

// 会话：30 分钟无活动后开启新会话
{
  const ids = ['sess_aaaaaaaa', 'sess_bbbbbbbb']
  const make = () => ids.shift()
  const first = resolveSession(null, 1000, make)
  assert.deepEqual(first, { id: 'sess_aaaaaaaa', lastAt: 1000, isEntry: true })
  const cont = resolveSession(JSON.stringify(first), 1000 + 29 * 60_000, make)
  assert.equal(cont.id, 'sess_aaaaaaaa')
  assert.equal(cont.isEntry, false)
  const expired = resolveSession(JSON.stringify(cont), cont.lastAt + 31 * 60_000, make)
  assert.equal(expired.id, 'sess_bbbbbbbb')
  assert.equal(expired.isEntry, true)
  assert.equal(resolveSession('{bad json', 5, () => 'sess_cccccccc').isEntry, true)
}

// UTM 只取字符串，限制长度
{
  assert.deepEqual(readUtm({ utm_source: 'douyin', utm_medium: 'video', utm_campaign: 'x'.repeat(200) }), { us: 'douyin', um: 'video', uc: 'x'.repeat(100) })
  assert.deepEqual(readUtm({ utm_source: ['a', 'b'] }), { us: '', um: '', uc: '' })
}

// 路由切换上报：首屏带 referrer/UTM/新访客标记，站内跳转不带；同路径 query 变化不重复上报
{
  const sent = []
  const storage = memoryStorage()
  const router = fakeRouter()
  let now = 10_000
  installSiteAnalytics(router, {
    send: payload => sent.push(payload),
    storage,
    now: () => now,
    doc: { referrer: 'https://www.baidu.com/s?wd=ai', title: '首页' },
    loc: { host: 'www.nananobanana.cn' },
    defer: fn => fn()
  })
  router.go(route('/', { utm_source: 'douyin' }), START)
  now += 5000
  router.go(route('/community'), route('/'))
  router.go({ ...route('/community', { tab: 'hot' }), fullPath: '/community?tab=hot' }, route('/community'))
  router.go(route('/docs'), route('/community'), new Error('aborted'))

  assert.equal(sent.length, 2)
  assert.equal(sent[0].p, '/')
  assert.equal(sent[0].e, true)
  assert.equal(sent[0].n, true)
  assert.equal(sent[0].r, 'https://www.baidu.com/s?wd=ai')
  assert.equal(sent[0].us, 'douyin')
  assert.equal(sent[0].h, 'www.nananobanana.cn')
  assert.match(sent[0].v, /^[A-Za-z0-9_-]{8,64}$/)
  assert.equal(sent[1].p, '/community')
  assert.equal(sent[1].e, false)
  assert.equal(sent[1].n, false)
  assert.equal(sent[1].r, '')
  assert.equal(sent[1].v, sent[0].v)
  assert.equal(sent[1].s, sent[0].s)
}

// 老访客：已有访客 ID 时不标记新访客
{
  const sent = []
  const router = fakeRouter()
  installSiteAnalytics(router, {
    send: payload => sent.push(payload),
    storage: memoryStorage({ nb_vid: 'visitor_existing1' }),
    now: () => 1,
    doc: { referrer: '', title: '' },
    loc: { host: 'a.cn' },
    defer: fn => fn()
  })
  router.go(route('/'), START)
  assert.equal(sent[0].v, 'visitor_existing1')
  assert.equal(sent[0].n, false)
}

// 存储不可用（隐私模式）时仍能上报，不抛错
{
  const sent = []
  const router = fakeRouter()
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  installSiteAnalytics(router, { send: p => sent.push(p), storage: broken, now: () => 1, doc: { referrer: '', title: '' }, loc: { host: 'a.cn' }, defer: fn => fn() })
  router.go(route('/'), START)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].e, true)
}

console.log('siteAnalytics tests passed')

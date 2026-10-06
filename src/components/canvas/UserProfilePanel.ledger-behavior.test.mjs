import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import zhCN from '../../i18n/locales/zh-CN.js'
import en from '../../i18n/locales/en.js'
import { getPointsLedgerTypeText } from '../../utils/pointsLedger.js'

const source = readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')
const translate = key => key.split('.').reduce((value, part) => value?.[part], zhCN) || key
const typeFunction = source.slice(source.indexOf('function getLedgerTypeText('), source.indexOf('const ledgerDisplayItems'))
const label = new Function('t', 'getPointsLedgerTypeText', `${typeFunction}; return getLedgerTypeText`)(translate, getPointsLedgerTypeText)

test('subuser ledger types are Chinese, including the screenshot return record', () => {
  for (const [type, expected] of Object.entries({
    subuser_return: '子用户积分返还', subuser_allocate_out: '向子用户分配积分',
    subuser_allocate: '接收分配积分', subuser_revoke: '分配积分回收',
    subuser_expire: '分配积分到期回收', subuser_refund: '分配积分退款',
    subuser_cancel_refund: '子用户任务取消退款'
  })) assert.equal(label(type), expected, type)
})

test('known ledger variants resolve to their Chinese base type', () => {
  assert.equal(label('audio_generation_package'), '音频生成')
  assert.equal(label('video_hd_upscale_refund'), '视频高清放大退款')
  assert.equal(label('llm_chat'), '智能对话')
})

test('unknown or missing types never expose internal English codes', () => {
  for (const type of ['future_internal_action', '', undefined, null]) assert.equal(label(type), '积分变动')
  assert.equal(label('已人工补偿'), '已人工补偿')
  assert.equal(label('checkin'), '签到奖励')
})

test('shared labels preserve translation priority and support the chosen language', () => {
  const english = key => key.split('.').reduce((value, part) => value?.[part], en) || key
  assert.equal(getPointsLedgerTypeText('subuser_return', english), 'Subuser Points Returned')
  assert.equal(getPointsLedgerTypeText('unknown_internal', english), 'Points Change')
  assert.equal(getPointsLedgerTypeText('generate_cost_package', translate), '生成消耗')
  assert.equal(getPointsLedgerTypeText('llm_action_subuser', translate), '智能操作')
  assert.equal(getPointsLedgerTypeText('unknown_internal', key => key), '积分变动')
  assert.equal(getPointsLedgerTypeText('checkin', key => ({ 'pointsType.checkin': '优先翻译', 'user.ledgerType.checkin': '次要翻译' }[key] || key)), '优先翻译')
})

function harness(fetch) {
  const state = {
    token: 'mock-token', ledger: ref([{ id: 'old', type: 'checkin' }]), ledgerPage: ref(1),
    ledgerPageSize: ref(20), ledgerTotal: ref(101), ledgerTotalPages: ref(6),
    ledgerLoading: ref(false), ledgerError: ref(''), ledgerRequestId: 0,
    ledgerPageSizeOptions: [20, 50, 100], getTenantHeaders: () => ({}), getApiUrl: url => url, fetch
  }
  const functions = source.slice(source.indexOf('async function loadLedger('), source.indexOf('// 加载数据\n'))
  return { ...state, ...new Function(...Object.keys(state), `${functions}; return {loadLedger, changeLedgerPageSize, goLedgerPage}`)(...Object.values(state)) }
}

const response = (page = 1, pageSize = 20) => ({ ok: true, json: async () => ({ records: [{ id: `page-${page}` }], total: 101, page, pageSize, totalPages: Math.ceil(101 / pageSize) }) })
const flush = () => new Promise(resolve => setImmediate(resolve))

test('page controls request server pages and page size changes reset to the first page', async () => {
  const requests = []
  const state = harness(async url => {
    requests.push(url)
    const params = new URL(url, 'http://localhost').searchParams
    return response(Number(params.get('page')), Number(params.get('pageSize')))
  })
  state.goLedgerPage(2)
  await flush()
  assert.equal(state.ledger.value[0].id, 'page-2')
  state.changeLedgerPageSize({ target: { value: '50' } })
  await flush()
  assert.equal(state.ledgerPage.value, 1)
  assert.equal(state.ledgerTotalPages.value, 3)
  assert.deepEqual(requests, ['/api/user/points?page=2&pageSize=20', '/api/user/points?page=1&pageSize=50'])
  state.goLedgerPage(99)
  await flush()
  assert.equal(state.ledgerPage.value, 3)
})

test('busy page controls cannot start duplicate or conflicting requests', () => {
  let requests = 0
  const state = harness(async () => { requests++; return response() })
  state.ledgerLoading.value = true
  state.goLedgerPage(2)
  state.changeLedgerPageSize({ target: { value: '50' } })
  assert.equal(requests, 0)
  assert.equal(state.ledgerPage.value, 1)
  assert.equal(state.ledgerPageSize.value, 20)
})

test('HTTP and network failures clear stale rows and offer a Chinese retry message', async () => {
  for (const fetch of [async () => ({ ok: false, status: 500 }), async () => { throw new Error('network failure') }]) {
    const state = harness(fetch)
    await state.loadLedger().catch(() => {})
    assert.equal(state.ledgerLoading.value, false)
    assert.deepEqual(state.ledger.value, [])
    assert.equal(state.ledgerError.value, '积分记录加载失败，请重试')
  }
})

test('a failed request can retry successfully and legacy and empty records still load', async () => {
  const responses = [
    { ok: false, status: 500 }, response(),
    { ok: true, json: async () => ({ ledger: [{ id: 'legacy' }] }) },
    { ok: true, json: async () => ({ records: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }) }
  ]
  const state = harness(async () => responses.shift())
  await state.loadLedger()
  assert.ok(state.ledgerError.value)
  await state.loadLedger()
  assert.equal(state.ledgerError.value, '')
  assert.equal(state.ledger.value[0].id, 'page-1')
  await state.loadLedger()
  assert.equal(state.ledger.value[0].id, 'legacy')
  await state.loadLedger()
  assert.deepEqual(state.ledger.value, [])
  assert.equal(state.ledgerTotal.value, 0)
  assert.equal(state.ledgerTotalPages.value, 1)
})

test('an older response cannot overwrite the latest page or finish its loading state', async () => {
  const resolvers = []
  const state = harness(() => new Promise(resolve => resolvers.push(resolve)))
  const older = state.loadLedger()
  state.ledgerPage.value = 2
  const newer = state.loadLedger()
  resolvers[0](response(1))
  await older
  assert.equal(state.ledgerLoading.value, true)
  resolvers[1](response(2))
  await newer
  assert.equal(state.ledger.value[0].id, 'page-2')
  assert.equal(state.ledgerPage.value, 2)
  assert.equal(state.ledgerLoading.value, false)
})

test('details are rendered in a standalone accessible dialog with the existing server pagination', () => {
  assert.ok(/class="ledger-expand-btn"/.test(source), 'details entry exists')
  assert.ok(/class="ledger-details-modal"[\s\S]*?role="dialog"/.test(source), 'standalone dialog exists')
  assert.ok(/aria-modal="true"/.test(source), 'dialog is modal')
  assert.ok(/@keydown="handleLedgerDialogKeydown"/.test(source), 'dialog handles keyboard navigation')
  assert.ok(/积分记录详情/.test(source), 'dialog has a Chinese title')
})

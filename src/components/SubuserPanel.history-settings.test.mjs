import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as Vue from 'vue'
import { parse } from '@vue/compiler-sfc'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

const descriptor = parse(fs.readFileSync(new URL('./SubuserPanel.vue', import.meta.url), 'utf8')).descriptor
const source = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')

async function mount({ disabled = false, failLoad = false } = {}) {
  const calls = [], callbacks = []
  let failSave = false
  const props = { parentId: '', request: async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/history-settings')) {
      if (options && failSave || !options && failLoad) throw new Error('保存接口不可用')
      if (options) disabled = options.body.history_delete_disabled
      return { history_delete_disabled: disabled }
    }
    return { users: [], summary: {}, total: 0 }
  } }
  const ui = new Function('ref', 'computed', 'onMounted', 'defineProps', `${source}; return { historySettings, historySettingsBusy, loadHistorySettings, toggleHistoryDeletion, error, notice }`)(Vue.ref, Vue.computed, fn => callbacks.push(fn), () => props)
  await Promise.all(callbacks.map(fn => fn()))
  return { ...ui, calls, props, setFailSave: () => { failSave = true } }
}

test('history switch loads saved state and persists each toggle before displaying success', async () => {
  const ui = await mount({ disabled: true })
  assert.equal(ui.historySettings.value.history_delete_disabled, true)
  await ui.toggleHistoryDeletion()
  assert.deepEqual(ui.calls.at(-1), { url: '/api/subusers/history-settings', options: { method: 'PATCH', body: { history_delete_disabled: false } } })
  assert.equal(ui.historySettings.value.history_delete_disabled, false)
  await ui.toggleHistoryDeletion()
  assert.equal(ui.historySettings.value.history_delete_disabled, true)
})

test('failed saves keep the previous state and repeated clicks send one request', async () => {
  const ui = await mount()
  ui.setFailSave()
  await ui.toggleHistoryDeletion()
  assert.equal(ui.historySettings.value.history_delete_disabled, false)
  assert.equal(ui.error.value, '保存接口不可用')
  assert.equal(ui.notice.value, '')
  ui.historySettingsBusy.value = true
  const count = ui.calls.length
  await ui.toggleHistoryDeletion()
  assert.equal(ui.calls.length, count)
})

test('load failure disables the switch and the real template exposes saved accessible state', async () => {
  const failed = await mount({ failLoad: true })
  assert.equal(failed.historySettings.value, null)
  await failed.toggleHistoryDeletion()
  assert.equal(failed.calls.filter(call => call.options).length, 0)
  const template = descriptor.template.content.match(/<section class="history-settings"[\s\S]*?<\/section>/)?.[0]
  assert.ok(template)
  const render = new Function('Vue', compile(template, { prefixIdentifiers: true }).code)(Vue)
  for (const disabled of [false, true]) {
    const ui = await mount({ disabled })
    const html = await renderToString(Vue.createSSRApp({ setup: () => ({ ...ui, loading: false, busy: false, forbidden: false }), render }))
    assert.match(html, /禁止子用户删除历史记录/)
    assert.match(html, new RegExp(`aria-checked="${disabled}"`))
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { computed } from 'vue'

let sequence = 0
async function boot(browserLanguage, savedLanguage = null, languages = [browserLanguage]) {
  const storage = new Map(savedLanguage ? [['language', savedLanguage]] : [])
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: browserLanguage, languages } })
  globalThis.document = { documentElement: { lang: '', dir: '' } }
  globalThis.window = { dispatchEvent() {} }
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail } }
  const i18n = await import(`./index.js?test=${sequence++}`)
  await i18n.initI18n()
  return i18n
}

test('traditional Chinese browser variants select the traditional language pack', async () => {
  for (const language of ['zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW']) {
    const i18n = await boot(language)
    assert.equal(i18n.currentLanguage.value, 'zh-TW', language)
  }
})

test('first render applies language and text direction, including saved preferences', async () => {
  for (const language of ['ar', 'ug', 'en']) {
    await boot('zh-CN', language)
    assert.equal(document.documentElement.lang, language)
    assert.equal(document.documentElement.dir, ['ar', 'ug'].includes(language) ? 'rtl' : 'ltr')
  }
})

test('language changes update existing computed labels and interpolate without changing values', async () => {
  const i18n = await boot('zh-CN')
  const label = computed(() => i18n.t('common.save'))
  assert.equal(label.value, '保存')
  await i18n.setLanguage('en')
  assert.equal(label.value, 'Save')
  assert.equal(document.documentElement.dir, 'ltr')
  assert.equal(await i18n.setLanguage('unsupported'), false)
  assert.equal(i18n.currentLanguage.value, 'en')
})

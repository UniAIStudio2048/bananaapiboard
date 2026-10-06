import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import * as Vue from 'vue'

globalThis.localStorage = { getItem: () => 'zh-CN' }
const { t, currentLanguage, initI18n } = await import('../../i18n/index.js')
const source = readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { bindings } = compileScript(descriptor, { id: 'currency-display-test' })
const template = baseParse(descriptor.template.content)

function renderFor(key) {
  function find(node) {
    if (node.type === 1 && node.props.some(prop =>
      prop.type === 7 && prop.exp?.content.includes(`'${key}'`)
    )) return node
    if (node.type === 1 && node.children.some(child =>
      child.type === 5 && child.content.content.includes(`'${key}'`)
    )) return node
    for (const child of node.children || []) {
      const found = find(child)
      if (found) return found
    }
  }
  const node = find(template)
  assert.ok(node, `Missing template text: ${key}`)
  const templateSource = node.tag === 'input'
    ? `<input ${node.props.find(prop => prop.name === 'bind' && prop.arg?.content === 'placeholder').loc.source} />`
    : node.loc.source
  const { code } = compile(templateSource, {
    mode: 'function', prefixIdentifiers: true, bindingMetadata: bindings
  })
  return new Function('Vue', code)(Vue)
}

const renderHint = renderFor('user.exchangeRateHint')
const renderPlaceholder = renderFor('user.enterTransferAmount')
const renderRechargeHint = renderFor('user.customAmountHint')

for (const language of ['zh-CN', 'en', 'ug']) {
  test(`${language}: currency text renders and updates without unresolved placeholders`, async () => {
    currentLanguage.value = language
    await initI18n()
    const currency = Vue.ref('CNY')
    const rate = Vue.ref(10)
    const setup = Vue.proxyRefs({
      t,
      exchangeRate: rate,
      currencyUnitLabel: Vue.computed(() => currency.value === 'USD' ? '美元' : '元'),
      currencySymbol: Vue.computed(() => currency.value === 'USD' ? '$' : '¥'),
      transferAmount: Vue.ref('')
    })
    for (const unit of ['CNY', 'USD']) {
      currency.value = unit
      const hint = renderHint({}, [], {}, setup).children
      const placeholder = renderPlaceholder({}, [], {}, setup).props.placeholder
      const rechargeHint = renderRechargeHint({}, [], {}, setup).children
      const label = language === 'en' ? setup.currencySymbol : setup.currencyUnitLabel
      for (const text of [hint, placeholder, rechargeHint]) {
        assert.doesNotMatch(text, /\{\w+\}/)
      }
      for (const text of [hint, rechargeHint]) assert.ok(text.includes(label), `${text} should contain ${label}`)
      if (language === 'zh-CN') assert.equal(placeholder, '请输入划转金额')
      else assert.ok(placeholder.includes(label), `${placeholder} should contain ${label}`)
      assert.ok(hint.includes('10'))
      if (language === 'zh-CN') assert.equal(hint, `汇率：1${label} = 10 永久积分`)
      if (language === 'en') assert.equal(hint, `Rate: ${label}1 = 10 permanent points`)
    }
    rate.value = 25
    assert.ok(renderHint({}, [], {}, setup).children.includes('25'))
  })
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import * as Vue from 'vue'

async function discounts(pkg) {
  const { getPackageDiscounts } = await import('./packageDiscounts.js')
  return getPackageDiscounts(pkg)
}

test('image, video and audio discounts are three separate benefits in that order', async () => {
  assert.deepEqual(await discounts({ generation_rates: { image: 0.85, video: 0.9, audio: 0.9, text: 0.5 } }), [
    { type: 'image', text: '图片生成享 8.5 折' },
    { type: 'video', text: '视频生成享 9 折' },
    { type: 'audio', text: '音频生成享 9 折' }
  ])
})

test('default rates, missing rates, invalid rates and surcharges are not discount benefits', async () => {
  for (const pkg of [undefined, {}, { generation_rates: { image: 1, video: '1.00', audio: 1 } },
    { generation_rates: { image: 0, video: -1, audio: null } },
    { generation_rates: { image: 'bad', video: Infinity, audio: 1.2 } }]) {
    assert.deepEqual(await discounts(pkg), [])
  }
})

test('single media discounts and string decimals render without floating point tails', async () => {
  assert.deepEqual(await discounts({ generation_rates: { image: '0.90', video: '1.00', audio: '1.00' } }), [
    { type: 'image', text: '图片生成享 9 折' }
  ])
  assert.deepEqual(await discounts({ generation_rates: { video: 0.29, audio: 0.01 } }), [
    { type: 'video', text: '视频生成享 2.9 折' },
    { type: 'audio', text: '音频生成享 0.1 折' }
  ])
})

function renderFeatures(file, className, context) {
  const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
  function find(node) {
    if (node.type === 1 && node.props.some(prop => prop.type === 6 && prop.name === 'class' && prop.value?.content === className)) return node
    for (const child of node.children || []) { const found = find(child); if (found) return found }
  }
  const node = find(baseParse(descriptor.template.content))
  assert.ok(node, `missing feature list in ${file}`)
  const { code } = compile(node.loc.source, { mode: 'function' })
  return new Function('Vue', code)(Vue)(context, [])
}

function textContent(node) {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textContent).join(' ')
  return textContent(node?.children || '')
}

for (const [file, className] of [
  ['../components/canvas/PackageModal.vue', 'package-features'],
  ['../views/Packages.vue', 'space-y-3 mb-6']
]) {
  test(`${file}: actual benefit template retains existing benefits and adds each discount`, async () => {
    const { getPackageDiscounts } = await import('./packageDiscounts.js')
    const pkg = { points: 18000, concurrent_limit: 30, duration_days: 365, generation_rates: { image: 0.85, video: 0.9, audio: 0.9 } }
    const vnode = renderFeatures(file, className, { pkg, getPackageDiscounts, formatPoints: value => String(value) })
    const text = textContent(vnode)
    for (const existing of ['18000', '30', '365']) assert.ok(text.includes(existing))
    for (const benefit of getPackageDiscounts(pkg)) assert.ok(text.includes(benefit.text), `${text} should include ${benefit.text}`)
    function iconCount(node) {
      if (Array.isArray(node)) return node.reduce((sum, child) => sum + iconCount(child), 0)
      if (!node || typeof node !== 'object') return 0
      return (node.type === 'svg' ? 1 : 0) + iconCount(node.children)
    }
    assert.equal(iconCount(vnode), 6)
    pkg.generation_rates = { image: 1, video: 1, audio: 1 }
    const undiscounted = renderFeatures(file, className, { pkg, getPackageDiscounts, formatPoints: value => String(value) })
    assert.doesNotMatch(textContent(undiscounted), /生成享/)
    assert.equal(iconCount(undiscounted), 3)
  })
}

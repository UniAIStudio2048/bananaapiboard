import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse as parseScript } from '@babel/parser'
import { parse, compile } from '@vue/compiler-dom'
import { parse as parseSfc } from '@vue/compiler-sfc'
import * as Vue from 'vue'

const profile = readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')
const modal = readFileSync(new URL('./PackageModal.vue', import.meta.url), 'utf8')
const canvas = readFileSync(new URL('../../views/Canvas.vue', import.meta.url), 'utf8')

function functionSource(source, name) {
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
  const ast = parseScript(script, { sourceType: 'module' })
  const fn = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(fn, `${name} must exist`)
  return script.slice(fn.start, fn.end)
}

function findElement(source, predicate) {
  const template = parseSfc(source).descriptor.template.content
  const visit = node => {
    if (node.type === 1 && predicate(node)) return node
    for (const child of node.children || []) {
      const found = visit(child)
      if (found) return found
    }
  }
  const node = visit(parse(template))
  assert.ok(node, 'expected account entry in the template')
  return node
}

for (const [label, action] of [['user.permanentPoints', 'convert'], ['user.packagePoints', 'packages'], ['user.recharge', 'recharge']]) {
  test(`${label} opens the matching existing card and closes the profile`, () => {
    const node = findElement(profile, node => node.tag === 'button' && node.loc.source.includes(`t('${label}')`) && (action !== 'recharge' || node.loc.source.includes('recharge-entry-btn')))
    const calls = []
    const render = runInNewContext(`(function () { ${compile(node.loc.source).code} })()`, { Vue })
    const vnode = render({
      t: key => key, icons: {}, userInfo: {}, formatPoints: () => '0', getPermanentUserPoints: () => 0,
      openAccountAction: value => calls.push(value), closePanel: () => calls.push('close')
    }, [])
    vnode.props.onClick()
    assert.deepEqual(calls.sort(), [action, 'close'].sort())
    assert.equal(vnode.props.type, 'button')
  })
}

test('canvas routes all three actions to its existing shopping cart instance', () => {
  const calls = []
  const context = {
    packageModalRef: { value: { openConvertModal: () => calls.push('convert'), openRechargeModal: () => calls.push('recharge') } },
    openPackageModal: () => calls.push('packages')
  }
  runInNewContext(`${functionSource(canvas, 'openAccountAction')}; openAccountAction('convert'); openAccountAction('recharge'); openAccountAction('packages')`, context)
  assert.deepEqual(calls, ['convert', 'recharge', 'packages'])
})

for (const [name, shown, resetFields] of [
  ['openConvertModal', 'showConvertModal', { convertAmount: '', convertError: '', convertSuccess: '' }],
  ['openRechargeModal', 'showRechargeModal', { rechargeAmount: null, customAmount: '', rechargeError: '', selectedRechargeCard: null }]
]) {
  test(`${name} refreshes account data on direct entry and resets previous input on reopening`, async () => {
    let loads = 0
    const context = {
      props: { visible: false }, [shown]: { value: false },
      ...Object.fromEntries(Object.keys(resetFields).map(key => [key, { value: 'previous input' }])),
      loadPackages: async () => { loads++ }, rechargeCards: { value: [] },
      fetch: async () => ({ ok: true, json: async () => ({ recharge_cards: [{ id: 1, amount: 1000 }] }) }),
      getApiUrl: value => value, getTenantHeaders: () => ({})
    }
    const open = runInNewContext(`${functionSource(modal, name)}; ${name}`, context)
    await open()
    assert.equal(loads, 1)
    assert.equal(context[shown].value, true)
    for (const [key, value] of Object.entries(resetFields)) assert.equal(context[key].value, value)
    context.props.visible = true
    await open()
    assert.equal(loads, 1, 'the shopping cart already has current account data')
  })
}

test('a direct modal stays visible without rendering the shopping cart underneath', () => {
  const overlay = findElement(modal, node => node.props.some(prop => prop.name === 'class' && prop.value?.content === 'package-modal-overlay'))
  const condition = overlay.props.find(prop => prop.name === 'if').exp.content
  assert.equal(runInNewContext(condition, { visible: false, showConvertModal: true, showRechargeModal: false }), true)
  assert.equal(runInNewContext(condition, { visible: false, showConvertModal: false, showRechargeModal: true }), true)
  assert.equal(runInNewContext(condition, { visible: false, showConvertModal: false, showRechargeModal: false }), false)
  const catalog = findElement(modal, node => node.props.some(prop => prop.name === 'class' && prop.value?.content === 'package-modal-container'))
  assert.equal(catalog.props.find(prop => prop.name === 'if')?.exp.content, 'visible')
})

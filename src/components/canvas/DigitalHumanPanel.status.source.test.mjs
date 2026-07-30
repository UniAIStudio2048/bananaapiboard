import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./DigitalHumanPanel.vue', import.meta.url), 'utf8')

test('数字人训练提交后立即上屏，并在状态变化时通知用户', () => {
  assert.match(source, /const result = await createDigitalHuman\(/)
  assert.match(source, /emit\('upsert', result\.asset\)/)
  assert.match(source, /showToast\(/)
  assert.match(source, /const results = await Promise\.all\(active\.map/)
  assert.match(source, /result\.asset\) emit\('upsert', result\.asset\)/)
})

test('训练提交和状态轮询不会用全量资产刷新覆盖即时状态', () => {
  const submitStart = source.indexOf('async function submitTraining')
  const refreshStart = source.indexOf('async function refreshTrainingStates')
  const refreshEnd = source.indexOf('async function openConsent', refreshStart)

  assert.doesNotMatch(source.slice(submitStart, refreshStart), /emit\('refresh'\)/)
  assert.doesNotMatch(source.slice(refreshStart, refreshEnd), /emit\('refresh'\)/)
})

test('已完成的数字人不提供独立添加到画布入口，只可作为图像节点引用', () => {
  assert.match(source, /emit = defineEmits\(\['insert-image', 'refresh', 'upsert'\]\)/)
  assert.match(source, /@click="emit\('insert-image', asset\)"/)
  assert.doesNotMatch(source, /添加到画布/)
  assert.doesNotMatch(source, /emit\('insert', asset\)/)
})

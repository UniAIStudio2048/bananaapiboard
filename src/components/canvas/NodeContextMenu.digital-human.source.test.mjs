import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./NodeContextMenu.vue', import.meta.url), 'utf8')
const start = source.indexOf('async function createDigitalHumanFromNode()')
const end = source.indexOf('// ========== Seedance 2.0 角色创建 ==========', start)
const functionSource = source.slice(start, end)

test('右键创建 HeyGen 数字人总是先转存训练素材', () => {
  assert.match(functionSource, /const sourceUrl = await uploadToCloudForAsset\(rawUrl, type\)/)
  assert.doesNotMatch(functionSource, /needsUploadToCloud\(rawUrl\)/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

const backgroundStart = source.indexOf('async function processGenerationInBackground')
assert.ok(backgroundStart >= 0, 'processGenerationInBackground should exist')
const backgroundSource = source.slice(backgroundStart, source.indexOf('async function handleGenerate', backgroundStart))

test('Seedance character asset replacement is gated by live replacements, not the submit-time snapshot', () => {
  // 角色素材替换的进入条件必须以后台实时收集的 characterReplacements 为准：
  // capturedState.characterAssetUris 是提交瞬间的快照，与实时遍历存在竞态，
  // 快照为空时会整体跳过替换，导致已过审角色资产以 TOS 预览 URL 直传 API。
  const charBranch = backgroundSource.slice(
    backgroundSource.indexOf('Seedance 2.0 角色素材处理'),
    backgroundSource.indexOf("apiType === 'bytefor'")
  )
  assert.match(charBranch, /if \(!capturedState\.isSeedanceOpenApiPro && characterReplacements\.length > 0\)/)
})

test('Seedance quick asset replacement is gated by live quickReplacements', () => {
  const idx = backgroundSource.indexOf('注入快捷过审')
  assert.ok(idx > 0, 'quick asset injection log should exist')
  const quickBranch = backgroundSource.slice(idx - 700, idx + 300)
  assert.match(quickBranch, /if \(capturedState\.isSeedance2\) \{\s*const quickReplacements = collectSeedanceMediaReplacements/)
  assert.match(quickBranch, /if \(quickReplacements\.length > 0\) \{\s*finalImages = applyOrderedMediaReplacements\(finalImages, quickReplacements\)/)
  assert.doesNotMatch(quickBranch, /quickAssetUris\.length > 0/)
})

test('replacement injection logs still reference the collected replacements', () => {
  assert.match(backgroundSource, /finalImages = applyOrderedMediaReplacements\(finalImages, characterReplacements\)/)
  assert.match(backgroundSource, /finalImages = applyOrderedMediaReplacements\(finalImages, quickReplacements\)/)
})

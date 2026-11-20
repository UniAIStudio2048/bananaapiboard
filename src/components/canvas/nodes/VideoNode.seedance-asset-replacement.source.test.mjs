import { uiTextIndex } from '../../../i18n/sourceAssertions.mjs'
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
    uiTextIndex(backgroundSource, 'Seedance 2.0 角色素材处理'),
    backgroundSource.indexOf("apiType === 'bytefor'")
  )
  assert.match(charBranch, /if \(!capturedState\.isSeedanceOpenApiPro && characterReplacements\.length > 0\)/)
})

test('Seedance quick asset replacement is gated by live quickReplacements', () => {
  const idx = uiTextIndex(backgroundSource, '注入快捷过审')
  assert.ok(idx > 0, 'quick asset injection log should exist')
  const quickBranch = backgroundSource.slice(idx - 700, idx + 300)
  assert.match(quickBranch, /if \(capturedState\.isSeedance2\) \{\s*const quickReplacements = collectSeedanceMediaReplacements/)
  assert.match(quickBranch, /if \(quickReplacements\.length > 0\) \{\s*finalImages = applyOrderedMediaReplacements\(finalImages, quickReplacements, \{ normalizeUrl: normalizeModelImageUrl \}\)/)
  assert.doesNotMatch(quickBranch, /quickAssetUris\.length > 0/)
})

test('replacement injection logs still reference the collected replacements', () => {
  assert.match(backgroundSource, /finalImages = applyOrderedMediaReplacements\(finalImages, characterReplacements, \{ normalizeUrl: normalizeModelImageUrl \}\)/)
  assert.match(backgroundSource, /finalImages = applyOrderedMediaReplacements\(finalImages, quickReplacements, \{ normalizeUrl: normalizeModelImageUrl \}\)/)
})

test('character replacement matches urls with the same normalization as finalImages capture', () => {
  // finalImages 捕获走 normalizeModelImageUrls（剥缩略参数/解包代理），sourceUrls 是
  // 角色节点原始 URL；两侧必须按同一规则归一化匹配，否则精确匹配失配、预览 URL
  // 留在 @图片1、asset:// 被追加到末尾（1080P 换头任务以裸 URL 直传的根因）。
  assert.match(source, /import \{[^}]*normalizeModelImageUrl[^}]*\} from '@\/utils\/canvasModelMedia'/)
})

test('Seedance confirms pending video reviews before using the resolved snapshot in reference_videos', () => {
  assert.match(backgroundSource, /capturedState\.referenceVideos = await refreshPendingSeedanceVideoReferences\(capturedState\.referenceVideos/)
  assert.match(backgroundSource, /ensureReferenceVideoUrlsAccessible\(capturedState\.nodeId, targetNodeId, capturedState\.referenceVideos\)/)
  assert.match(source, /let finalVideos = capturedState\.referenceVideos \|\| referenceVideos\.value \|\| \[\]/)
  assert.match(source, /const orderedVideos = finalVideos[\s\S]*?formData\.append\('reference_videos', JSON\.stringify\(orderedVideos/)
})

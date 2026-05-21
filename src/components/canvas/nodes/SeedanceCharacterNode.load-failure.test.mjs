import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SeedanceCharacterNode.vue', import.meta.url), 'utf8')

// 防回归：当 assetUrl 重试 N 次仍失败时，节点必须给用户"重新选择角色"入口，
// 不能让节点只能删除。原代码 handleImageError 在重试耗尽后直接 return，UI 卡死。

test('SeedanceCharacterNode declares assetLoadFailed state', () => {
  assert.match(source, /const assetLoadFailed = ref\(false\)/)
})

test('handleImageError 重试耗尽后置位 assetLoadFailed', () => {
  const handlerMatch = source.match(/function handleImageError\(\)\s*\{([\s\S]*?)\n\}/)
  assert.ok(handlerMatch, 'handleImageError 函数应存在')
  const body = handlerMatch[1]
  // 必须在 retryCount >= MAX 时把 assetLoadFailed 置 true
  assert.match(
    body,
    /assetUrlRetryCount >= MAX_ASSET_URL_RETRY[\s\S]*?assetLoadFailed\.value = true/
  )
})

test('assetId / assetUrl 变更时重置 assetLoadFailed', () => {
  // assetId 变更（重新选择角色）必须重置失败标志
  assert.match(
    source,
    /watch\(\(\) => props\.data\?\.assetId,\s*\(\)\s*=>\s*\{[\s\S]*?assetLoadFailed\.value = false/
  )
  // assetUrl 变更（resolveAssetUrl 拿到新签名 URL）也要重置，给新 URL 一次机会
  assert.match(
    source,
    /watch\(\(\) => props\.data\?\.assetUrl,\s*\(\)\s*=>\s*\{[\s\S]*?assetLoadFailed\.value = false/
  )
})

test('模板在 assetLoadFailed 时显示"重新选择角色"入口', () => {
  // 失败覆盖层必须存在，且点击调用 openSelector
  assert.match(
    source,
    /v-if="assetLoadFailed"[\s\S]*?class="character-failed"[\s\S]*?@click\.stop="openSelector"/
  )
  // 失败时不再渲染裂图 <img>
  assert.match(
    source,
    /v-else-if="data\.assetUrl"\s*\n\s*:src="data\.assetUrl"/
  )
})

test('character-failed 覆盖层有样式', () => {
  assert.match(source, /\.character-failed\s*\{/)
})

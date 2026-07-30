import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./ImageNode.vue', import.meta.url)), 'utf8')

test('数字人形象图引用在图像节点右上角展示 HeyGen 标签', () => {
  assert.match(source, /import \{ getAsset \} from '@\/api\/canvas\/assets'/)
  assert.match(source, /const isHeygenDigitalHumanReference = computed\(\(\) => \{/) 
  assert.match(source, /props\.data\?\.digitalHumanAssetId \|\|\s*metadata\.digitalHumanAssetId/)
  assert.match(source, /v-if="isHeygenDigitalHumanReference" class="heygen-digital-human-badge">HeyGen数字人<\/div>/)
  assert.match(source, /\.heygen-digital-human-badge \{[\s\S]*position: absolute;[\s\S]*right: 8px;[\s\S]*top: 8px;[\s\S]*transform: rotate\(8deg\);[\s\S]*pointer-events: none;/)
})

test('旧画布的数字人形象图会按资产类型补回标记并持久化', () => {
  assert.match(source, /async function restoreDigitalHumanAssetReference\(\) \{/) 
  assert.match(source, /const result = await getAsset\(assetId\)/)
  assert.match(source, /if \(asset\?\.type !== 'digital-human'\) return/)
  assert.match(source, /digitalHumanAssetId: asset\.id/)
  assert.match(source, /assetType: 'digital-human'/)
  assert.match(source, /restoreDigitalHumanAssetReference\(\)/)
})

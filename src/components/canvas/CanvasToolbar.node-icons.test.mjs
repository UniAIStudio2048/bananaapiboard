import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const toolbar = readFileSync(new URL('./CanvasToolbar.vue', import.meta.url), 'utf8')
const selector = readFileSync(new URL('./NodeSelector.vue', import.meta.url), 'utf8')

for (const [type, icon] of [
  ['script', 'FileText'], ['text-input', 'Type'], ['image-input', 'Image'],
  ['video-input', 'Film'], ['audio-input', 'AudioLines']
]) {
  assert.match(toolbar, new RegExp(`['"]?${type}['"]?\\s*:\\s*${icon}\\b`), `${type} 应使用与节点选择器一致的图标`)
  assert.match(selector, new RegExp(`\\b${icon}\\b`), `节点选择器应包含 ${icon}`)
}
assert.match(toolbar, /<component\s+:is="toolbarNodeIcons\[node\.type\]"/)
assert.match(toolbar, /<Upload\s+class="node-icon"/)
console.log('画布工具栏节点图标一致性检查通过')

for (const panel of ['AssetPanel.vue', 'HistoryPanel.vue']) {
  const source = readFileSync(new URL(`./${panel}`, import.meta.url), 'utf8')
  for (const [type, icon] of [['image', 'Image'], ['video', 'Film'], ['audio', 'AudioLines']]) {
    assert.match(source, new RegExp(`['"]?${type}['"]?\\s*:\\s*${icon}\\b`), `${panel} 的 ${type} 图标应与节点选择器一致`)
  }
  assert.match(source, /<component\s+:is="fileTypeIcons\[ft\.key\]"/)
}

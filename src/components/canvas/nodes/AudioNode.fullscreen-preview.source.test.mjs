import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('AudioNode exposes a fullscreen audio preview beside the download action', () => {
  assert.match(source, /const isFullscreenPreview = ref\(false\)/)
  assert.match(source, /function handleToolbarPreview\(\) \{[\s\S]*?openFullscreenPreview\(\)/)

  const toolbar = source.match(/<div v-show="showToolbar && !props\.data\?\.readonly" class="audio-toolbar">[\s\S]*?<\/div>\s*<!-- 节点标签 -->/)
  assert.ok(toolbar, 'audio toolbar should exist')
  assert.match(
    toolbar[0],
    /title="下载"[\s\S]*?handleToolbarDownload[\s\S]*?title="全屏预览"[\s\S]*?handleToolbarPreview/
  )

  assert.match(source, /<Teleport to="body">[\s\S]*?v-if="isFullscreenPreview"[\s\S]*?<audio[\s\S]*?:src="audioUrl"[\s\S]*?controls[\s\S]*?autoplay/)
})

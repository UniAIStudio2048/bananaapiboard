import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref } from 'vue'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const start = source.indexOf('const MINIMAX_H3_MODES = [')
const end = source.indexOf('// Wan 3.0 模式选择', start)
assert.ok(start >= 0 && end > start)

function dropdown(modelConfig, selectedMode = '') {
  return runInNewContext(`${source.slice(start, end)}; ({
    modes: minimaxH3Modes.value,
    defaultMode: minimaxH3DefaultMode.value,
    current: currentMinimaxH3ModeConfig.value
  })`, {
    computed,
    currentModelConfig: ref(modelConfig),
    selectedMinimaxH3Mode: ref(selectedMode)
  })
}

test('MiniMax 和 AtlasCloud H3 下拉仅显示三种生成方式，保留请求模式值', () => {
  for (const apiType of ['minimax-h3', 'atlascloud-video', 'atlascloud-video-t2v']) {
    const { modes } = dropdown({ apiType })
    assert.deepEqual(Array.from(modes, m => m.label), ['文生视频', '图生视频', '参考生视频'])
    assert.deepEqual(Array.from(modes, m => m.value), ['text2video', 'image2video_first', 'multimodal_ref'])
    assert.equal(modes[1].needsImage, true)
    assert.equal(modes[1].maxImages, 1)
  }
})

test('明确禁用的生成方式不显示，旧首尾帧默认值回退到有效选项', () => {
  const result = dropdown({ minimaxConfig: {
    defaultMode: 'image2video_first_last',
    supportedModes: { text2video: false, image2video_first: true, multimodal_ref: false }
  } }, 'image2video_first_last')
  assert.deepEqual(Array.from(result.modes, m => m.label), ['图生视频'])
  assert.equal(result.defaultMode, 'image2video_first')
  assert.equal(result.current.value, 'image2video_first')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('RunningHub V3.1 画布节点定义六种生成模式', () => {
  assert.match(source, /RUNNINGHUB_V31_MODES = \[/, '应定义六种生成模式')
  for (const mode of ['t2v', 'i2v', 'first_last_frame', 'last_frame', 'multi_image', 'image_audio']) {
    assert.match(source, new RegExp(`value: '${mode}'`), `应包含模式 ${mode}`)
  }
})

test('RunningHub V3.1 画布节点提交 video_mode 并携带音频', () => {
  assert.match(source, /isRunningHubAiAppVideoV31Model/, '应识别 V3.1 模型')
  assert.match(source, /formData\.append\('video_mode', activeV31Mode\)/, '提交时应携带 V3.1 生成模式')
  assert.match(source, /formData\.append\('reference_audios', JSON\.stringify\(referenceAudios\.value\.slice\(0, 1\)\)\)/, '图像音频模式应提交音频')
})

test('RunningHub V3.1 画布节点接入统一模式选择器并校验输入', () => {
  assert.match(source, /key: 'runninghub-v31'/, '应接入统一模式选择器')
  assert.match(source, /case 'runninghub-v31':/, '模式切换应更新 v31Mode')
  assert.match(source, /v31ModeConfig\.value\.needsImages/, '应按模式校验图片数量')
  assert.match(source, /v31ModeConfig\.value\.needsAudio/, '图像音频模式应校验音频')
  assert.match(source, /v31Mode === 'image_audio'/, '图像音频模式应有提示')
  assert.match(source, /v31Mode: isRunningHubAiAppVideoV31Model\.value \? v31Mode\.value : ''/, '指纹应包含 V3.1 模式')
})

test('RunningHub V3.1 画布节点在模型配置加载完成前不覆盖已保存时长', () => {
  assert.match(source, /isVideoModelConfigLoaded/, '应定义配置加载完成判断')
  assert.match(source, /if \(!isVideoModelConfigLoaded\(\)\) return/, '配置未加载时不应覆盖时长')
  assert.match(source, /isVideoModelConfigLoaded\(\) && !isPerSecondBilling/, 'onMounted 重置时长也应等待配置加载')
  assert.match(source, /v31Options\.includes\(String\(selectedDuration\.value\)\)/, 'V3.1 只保留合法时长选项')
})

console.log('RunningHub V3.1 画布节点 source tests passed')

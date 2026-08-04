import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')

assert.match(source, /apiType === 'runninghub-ai-app-video-v31'/, 'V3.1 模型应被识别')
assert.match(source, /RUNNINGHUB_V31_MODES/, '应定义 6 种生成模式')
assert.match(source, /formData\.append\('video_mode', v31Mode\.value\)/, '提交时应携带 V3.1 生成模式')
assert.match(source, /formData\.append\('referenceAudios', v31AudioFile\.value\)/, '图像音频模式应提交音频文件')
assert.match(source, /v31ModeConfig\.value\.needsImages/, '图片数量应按模式校验')
assert.match(source, /v31NeedsAudio/, '音频模式应有开关')
assert.match(source, /v31AudioFile/, '应维护音频文件状态')

console.log('RunningHub V3.1 视频前端 source tests passed')

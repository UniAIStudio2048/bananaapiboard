import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')

assert.match(source, /apiType === 'runninghub-ai-app-video'/, 'RunningHub 模型应识别为能力驱动清晰度模型')
assert.match(source, /resolutionOptions/, '清晰度选择应读取模型配置')
assert.match(source, /resolutionMultipliers/, '成本预估应读取分辨率倍率')
assert.match(source, /resolutionFixedCosts/, '成本预估应优先读取分辨率固定积分')
assert.match(source, /costPerSecond/, '成本预估应读取每秒积分')
assert.match(source, /maxRefImages/, '参考图上限应读取模型配置')
assert.match(source, /formData\.append\('resolution', resolution\.value\)/, '能力驱动模型提交时应携带清晰度')

console.log('RunningHub AI App 视频前端 source tests passed')

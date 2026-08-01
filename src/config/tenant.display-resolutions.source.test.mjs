import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'tenant.js'), 'utf8')

test('租户视频模型对象透传 displayResolutions（画布与生成页读取）', () => {
  // 主路径（新格式 video_models）
  assert.match(source, /resolutionOptions: getVideoResolutionOptions\(modelConfig\),\n\s*displayResolutions: modelConfig\.displayResolutions,/)
  // 旧格式回退路径
  assert.match(source, /resolutionOptions: getVideoResolutionOptions\(modelFullConfig\),\n\s*displayResolutions: modelFullConfig\.displayResolutions,/)
  // VEO 禁用整合时的独立子模型入口
  assert.match(source, /resolutionOptions: getVideoResolutionOptions\(modelConfig\),\n\s*displayResolutions: modelConfig\.displayResolutions,\n\s*resolutionPricing: modelConfig\.resolutionPricing,\n\s*actualModel:/)
  // VEO / VEO 4K 整合入口取首个子模型配置
  assert.match(source, /displayResolutions: veoSubModels\[0\]\?\.displayResolutions,/)
  assert.match(source, /displayResolutions: veo4kSubModels\[0\]\?\.displayResolutions,/)
})

test('租户视频模型对象透传 resolutionPricing（按分辨率积分每秒）', () => {
  assert.match(source, /resolutionOptions: getVideoResolutionOptions\(modelConfig\),\n\s*displayResolutions: modelConfig\.displayResolutions,\n\s*resolutionPricing: modelConfig\.resolutionPricing,/)
  assert.match(source, /resolutionOptions: getVideoResolutionOptions\(modelFullConfig\),\n\s*displayResolutions: modelFullConfig\.displayResolutions,\n\s*resolutionPricing: modelFullConfig\.resolutionPricing,/)
  assert.match(source, /resolutionOptions: getVideoResolutionOptions\(modelConfig\),\n\s*displayResolutions: modelConfig\.displayResolutions,\n\s*resolutionPricing: modelConfig\.resolutionPricing,\n\s*actualModel:/)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('画布 MiniMax H3 按后台每秒积分配置提供分辨率选择并持久化', () => {
  assert.match(source, /const minimaxH3Resolution = ref\(props\.data\.minimaxH3Resolution \|\| ''\)/)
  assert.match(source, /const minimaxH3ResolutionOptions = computed\(\(\) => \{[\s\S]*?minimaxConfig[\s\S]*?resolutionCosts/)
  assert.match(source, /videoParameterResolutionOptions = computed\(\(\) => \{[\s\S]*?isMinimaxH3Model\.value[\s\S]*?minimaxH3ResolutionOptions\.value\.map/)
  assert.match(source, /selectedVideoParameterResolution = computed\(\{[\s\S]*?isMinimaxH3Model\.value\) return minimaxH3Resolution\.value[\s\S]*?isMinimaxH3Model\.value\) minimaxH3Resolution\.value = value/)
  assert.match(source, /minimaxH3Resolution, selectedMinimaxH3Mode/)
  assert.match(source, /minimaxH3Resolution: minimaxH3Res/)
})

test('画布 MiniMax H3 的预估积分和提交请求使用所选分辨率', () => {
  assert.match(source, /const h3Res = minimaxH3Resolution\.value \|\| h3Cfg\.resolution \|\| '2K'/)
  assert.match(source, /formData\.append\('resolution', capturedState\.minimaxH3Resolution \|\| minimaxH3Resolution\.value\)/)
})

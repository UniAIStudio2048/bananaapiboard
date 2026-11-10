import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const videoGenerationSource = readFileSync(new URL('../../../views/VideoGeneration.vue', import.meta.url), 'utf8')

test('canvas Wan3 prompt extension defaults off and persists the user choice', () => {
  assert.match(source, /const wan3PromptExtend = ref\(props\.data\.wan3PromptExtend === true\)/)
  assert.match(source, /wan3PromptExtend: isOfficialWan3Model\.value \? wan3PromptExtend\.value : false/)
  assert.match(source, /capturedState\.apiType === 'wan3'[\s\S]*wan3_prompt_extend/)
  assert.match(source, /官方万相 3\.0 高级选项/)
  assert.match(source, /智能扩写提示词[\s\S]*v-model="wan3PromptExtend"/)
})

test('regular Wan3 generation also defaults prompt extension off', () => {
  assert.match(videoGenerationSource, /const wan3PromptExtend = ref\(false\)/)
  assert.match(videoGenerationSource, /wan3Config\.promptExtend === true/)
})

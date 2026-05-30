import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')

test('image processing state tracks elapsed generation time like video node', () => {
  assert.match(
    source,
    /import \{[\s\S]*formatVideoGenerationElapsed[\s\S]*getVideoGenerationElapsedSeconds[\s\S]*\} from '@\/utils\/videoGenerationProgress'/
  )
  assert.match(source, /const elapsedTimeNow = ref\(Date\.now\(\)\)/)
  assert.match(source, /let elapsedTimeTimer = null/)
  assert.match(source, /function getImageProcessingTimingData\(data = props\.data\)/)
  assert.match(source, /function imageProcessingElapsedText\(data = props\.data\)/)
  assert.match(source, /formatVideoGenerationElapsed\(getVideoGenerationElapsedSeconds\(getImageProcessingTimingData\(data\), elapsedTimeNow\.value\)\)/)
})

test('image processing template renders elapsed duration under the generating label', () => {
  const processingBlockMatch = source.match(
    /<div v-if="data\.status === 'processing'" class="preview-loading">[\s\S]*?<\/div>\s*<!-- 错误状态 -->/
  )
  assert.ok(processingBlockMatch, 'processing preview block should exist')
  const processingBlock = processingBlockMatch[0]

  assert.match(processingBlock, /<span class="processing-text">\{\{ data\.progress \|\| '生成中' \}\}<\/span>/)
  assert.match(processingBlock, /<span class="processing-duration-text">\{\{ imageProcessingElapsedText\(data\) \}\}<\/span>/)
})

test('image generation stores processingStartedAt when entering processing state', () => {
  const handleGenerateMatch = source.match(/async function handleGenerate\([\s\S]*?\n\}/)
  assert.ok(handleGenerateMatch, 'handleGenerate should exist')
  assert.match(handleGenerateMatch[0], /processingStartedAt: Date\.now\(\)/)
})

test('image processing helper nodes store a start time for elapsed display', () => {
  assert.match(source, /status: 'processing',\s*processingStartedAt: Date\.now\(\),\s*progress: '高清处理中\.\.\.'/)
  assert.match(source, /status: 'processing',\s*processingStartedAt: Date\.now\(\),\s*progress: '全景图生成中\.\.\.'/)
  assert.match(source, /status: 'processing',\s*processingStartedAt: Date\.now\(\),\s*progress: '抠图处理中\.\.\.'/)
  assert.match(source, /status: 'processing',\s*processingStartedAt: Date\.now\(\),\s*cameraAngle: data\.angles/)
  assert.match(source, /status: 'processing', \/\/ 使用 processing 状态显示"生成中"\s*processingStartedAt: Date\.now\(\),\s*progress: '生成中\.\.\.'/)
})

test('image elapsed timer is started and cleared with component lifecycle', () => {
  assert.match(source, /elapsedTimeTimer = setInterval\(\(\) => \{[\s\S]*?elapsedTimeNow\.value = Date\.now\(\)[\s\S]*?\}, 1000\)/)
  assert.match(source, /if \(elapsedTimeTimer\) \{[\s\S]*?clearInterval\(elapsedTimeTimer\)[\s\S]*?elapsedTimeTimer = null[\s\S]*?\}/)
})

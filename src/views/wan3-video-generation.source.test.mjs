import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(directory, 'VideoGeneration.vue'), 'utf8')

test('万相 3.0 提供独立输入模式，避免沿用 Seedance 专有协议', () => {
  assert.match(source, /const WAN3_MODES = \[/)
  for (const mode of ['text2video', 'image2video_first', 'image2video_first_last', 'multimodal_ref', 'file', 'link']) {
    assert.match(source, new RegExp(`value: '${mode}'`))
  }
  assert.match(source, /const isWan3Model = computed\(\(\) => \['wan3', 'routerbee-wan3'\]\.includes\(currentModelConfig\.value\?\.apiType\)\)/)
  assert.doesNotMatch(source, /isReferenceVideoModel\.value \|\| isWan3Model\.value/)
})

test('万相 3.0 的 4 秒 480P 请求传递百炼字段', () => {
  assert.match(source, /isWan3Model\.value \? String\(wan3Duration\.value\) : currentDuration/)
  assert.match(source, /formData\.append\('resolution', resolution\.value\)/)
  assert.match(source, /formData\.append\('wan3_audio', wan3GenerateAudio\.value \? 'true' : 'false'\)/)
  assert.match(source, /formData\.append\('wan3_prompt_extend', wan3PromptExtend\.value \? 'true' : 'false'\)/)
  assert.match(source, /formData\.append\('firstFrameImage', seedanceFirstFrameFile\.value\)/)
  assert.match(source, /formData\.append\('lastFrameImage', seedanceLastFrameFile\.value\)/)
  assert.match(source, /formData\.append\('wan3Files', wan3File\.value\)/)
  assert.match(source, /formData\.append\('wan3_links', JSON\.stringify\(\[wan3Link\.value\.trim\(\)\]\)\)/)
})

test('万相 3.0 在提交前限制输入组合，且其 UI 可配置所有官方模式', () => {
  assert.match(source, /if \(isWan3Model\.value\) \{/)
  assert.match(source, /万相 3\.0 首尾帧不能与参考素材、文件或网页链接同时使用/)
  assert.match(source, /万相 3\.0 文件和网页链接不能同时使用/)
  assert.match(source, /v-if="isWan3Model"/)
  assert.match(source, /参考图片、视频、音频、文件和链接不能混用首尾帧/)
  assert.match(source, /v-model\.number="wan3Duration"/)
  assert.match(source, /v-for="dur in availableDurations"/)
})

test('万相 3.0 模式校验在提交函数中执行，而非历史耗时展示函数', () => {
  const generateVideoStart = source.indexOf('async function generateVideo()')
  const reviewSubmissionStart = source.indexOf('  const reviewSubmission = getQuickImageReviewSubmission()', generateVideoStart)
  const submissionValidation = source.slice(generateVideoStart, reviewSubmissionStart)

  assert.match(submissionValidation, /if \(isWan3Model\.value\) \{/)
  assert.match(submissionValidation, /wan3Mode\.value === 'image2video_first'/)
  assert.match(submissionValidation, /wan3Mode\.value === 'file' && !wan3File\.value/)
})

test('万相 3.0 本地参考视频遵从输入加输出不超过 30 秒', () => {
  assert.match(source, /totalDuration \+ metadata\.duration \+ Number\(wan3Duration\.value\) > 30/)

  const generateVideoStart = source.indexOf('async function generateVideo()')
  const reviewSubmissionStart = source.indexOf('  const reviewSubmission = getQuickImageReviewSubmission()', generateVideoStart)
  const submissionValidation = source.slice(generateVideoStart, reviewSubmissionStart)
  assert.match(submissionValidation, /referenceVideoDuration \+ requestedWan3Duration > 30/)
})

test('万相 3.0 本地媒体采用官方图像、视频和音频规格', () => {
  assert.match(source, /maxLongSide: isWan3Model\.value \? 8000 : 6000/)
  assert.match(source, /shortSide < 240 \|\| longSide > 8000 \|\| longSide \/ shortSide > 8/)
  assert.match(source, /metadata\.duration < 1 \|\| metadata\.duration > 15/)
  assert.match(source, /metadata\.width < 240 \|\| metadata\.height < 240 \|\| metadata\.width > 4096 \|\| metadata\.height > 4096/)
  assert.match(source, /isWan3Model\.value \? \(dur < 1 \|\| dur > seedanceAudioMax\)/)
  assert.match(source, /const seedanceAudioMax = isWan3Model\.value \? 15/)
})

test('万相 3.0 的非文生模式允许留空提示词，由媒体素材单独驱动生成', () => {
  assert.match(source, /const wan3AllowEmpty = isWan3Model\.value && wan3Mode\.value !== 'text2video'/)
  assert.match(source, /!seedanceAllowEmpty && !klingOmniAllowEmpty && !wan3AllowEmpty/)
})

test('万相 3.0 文生模式不沿用通用图生参考图片校验', () => {
  assert.match(
    source,
    /mode\.value === 'image' && !isReferenceVideoModel\.value && !isWan3Model\.value && !isKlingV3OmniModel\.value && imageFiles\.value\.length === 0/
  )
})

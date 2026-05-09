import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function read(relativePath) {
  return readFileSync(join(__dirname, relativePath), 'utf8')
}

const modal = read('VideoToolModal.vue')
const sourceRail = read('video-tool/VideoSourceRail.vue')
const timeline = read('video-tool/VideoTimeline.vue')
const preview = read('video-tool/VideoPreview.vue')
const controls = read('video-tool/SubtitleEraseControls.vue')

for (const component of ['VideoSourceRail', 'VideoTimeline', 'VideoPreview', 'SubtitleEraseControls']) {
  assert.match(modal, new RegExp(`import ${component}`), `VideoToolModal should import ${component}`)
}

for (const apiName of ['estimateSubtitleErase', 'createSubtitleEraseTask', 'getSubtitleEraseTask', 'exportVideoTimeline']) {
  assert.match(modal, new RegExp(apiName), `VideoToolModal should use ${apiName}`)
}

for (const helperName of ['normalizeTimelineClips', 'getTimelineTotalSeconds']) {
  assert.match(modal, new RegExp(helperName), `VideoToolModal should use ${helperName}`)
}

for (const label of ['剪辑', '字幕擦除', '标准擦除', '精细擦除', '提交处理']) {
  assert.match(modal, new RegExp(label), `VideoToolModal should render ${label}`)
}

for (const className of ['video-tool-modal', 'video-tool-modal__top-actions', 'video-tool-modal__submit-bar']) {
  assert.match(modal, new RegExp(className), `VideoToolModal should include ${className}`)
}

assert.match(sourceRail, /getHistory\(\{\s*type:\s*'video'/, 'VideoSourceRail should load video history with getHistory')
for (const label of ['画布', '上传', '历史']) {
  assert.match(sourceRail, new RegExp(label), `VideoSourceRail should render ${label}`)
}

for (const label of ['开始', '结束', '总时长']) {
  assert.match(timeline, new RegExp(label), `VideoTimeline should render ${label}`)
}
for (const eventName of ['dragstart', 'drop', 'removeClip', 'updateClip']) {
  assert.match(timeline, new RegExp(eventName), `VideoTimeline should support ${eventName}`)
}

assert.match(preview, /normalizePreviewRectToVideo/, 'VideoPreview should normalize fine erase rectangles')
for (const pointerEvent of ['pointerdown', 'pointermove', 'pointerup']) {
  assert.match(preview, new RegExp(pointerEvent), `VideoPreview should handle ${pointerEvent}`)
}

for (const label of ['标准擦除', '精细擦除']) {
  assert.match(controls, new RegExp(label), `SubtitleEraseControls should render ${label}`)
}

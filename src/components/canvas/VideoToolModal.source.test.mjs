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

for (const component of ['VideoSourceRail', 'VideoTimeline', 'VideoPreview']) {
  assert.match(modal, new RegExp(`import ${component}`), `VideoToolModal should import ${component}`)
}

for (const apiName of ['estimateSubtitleErase', 'exportVideoTimeline']) {
  assert.match(modal, new RegExp(apiName), `VideoToolModal should use ${apiName}`)
}

for (const helperName of ['normalizeTimelineClips', 'getTimelineTotalSeconds']) {
  assert.match(modal, new RegExp(helperName), `VideoToolModal should use ${helperName}`)
}

for (const label of ['剪辑', '字幕擦除', '选区擦除', '全域智能擦除', '高级水印/字幕擦除', '选区水印/字幕擦除', '全域水印/字幕擦除', '合成视频', '开始擦除']) {
  assert.match(modal, new RegExp(label), `VideoToolModal should render ${label}`)
}

for (const className of ['video-tool-modal', 'video-tool-modal__mode-tabs', 'video-tool-modal__mode-tab', 'video-tool-modal__erase-dropdown', 'video-tool-modal__submit-btn']) {
  assert.match(modal, new RegExp(className), `VideoToolModal should include ${className}`)
}

const addSourceIndex = modal.indexOf('async function addSourceToTimeline(source)')
const immediateInsertIndex = modal.indexOf('clips.value = [...clips.value, clip]', addSourceIndex)
const metadataProbeIndex = modal.indexOf("document.createElement('video')", addSourceIndex)
assert.ok(addSourceIndex >= 0, 'VideoToolModal should define addSourceToTimeline')
assert.ok(
  immediateInsertIndex > addSourceIndex && immediateInsertIndex < metadataProbeIndex,
  'VideoToolModal should add the initial source before async metadata probing so subtitle erase is immediately clickable'
)

const submitBlock = modal.match(/async function submit\(\) \{[\s\S]*?\n\}/)?.[0] || ''
assert.match(submitBlock, /emit\('export-started',\s*\{[\s\S]*mode:\s*'subtitle'[\s\S]*clips:/, 'subtitle erase should hand off clips to the parent immediately')
assert.doesNotMatch(submitBlock, /await\s+createSubtitleEraseTask/, 'subtitle erase modal should not wait for provider task creation before closing')
assert.match(submitBlock, /请先在视频上框选需要擦除的区域/, 'selection erase should reject an empty selection before handoff')

assert.match(sourceRail, /getHistory\(\{\s*type:\s*'video'/, 'VideoSourceRail should load video history with getHistory')
assert.match(sourceRail, /thumbnailUrl:\s*item\.thumbnailUrl\s*\|\|\s*item\.thumbnail_url\s*\|\|\s*item\.cover_url/, 'VideoSourceRail should preserve history and canvas thumbnail URLs')
assert.match(sourceRail, /class="video-source-rail__thumb"/, 'VideoSourceRail should render a thumbnail well for each video source')
assert.match(sourceRail, /import \{ getMediaUrl \} from '@\/config\/tenant'/, 'VideoSourceRail should resolve relative media URLs for thumbnails')
assert.match(sourceRail, /<img[\s\S]*v-if="source\.thumbnailUrl"[\s\S]*:src="displayMediaUrl\(source\.thumbnailUrl\)"/, 'VideoSourceRail should prefer poster images when a thumbnail URL exists')
assert.match(sourceRail, /<video[\s\S]*v-else[\s\S]*:src="displayMediaUrl\(source\.url\)/, 'VideoSourceRail should fall back to the source video as the thumbnail preview')
assert.match(sourceRail, /maxRetries:\s*4/, 'VideoSourceRail should use the resilient upload retry budget')
assert.match(sourceRail, /onProgress:\s*progress\s*=>/, 'VideoSourceRail should expose upload progress immediately')
assert.match(sourceRail, /正在重试/, 'VideoSourceRail should automatically retry transient upload failures')
assert.match(sourceRail, /finally\s*\{[\s\S]*event\.target\.value\s*=\s*''/, 'VideoSourceRail should allow selecting the same file again after failure')
const uploadBlock = sourceRail.match(/async function handleUpload\(event\) \{[\s\S]*?\n\}/)?.[0] || ''
assert.ok(uploadBlock.indexOf('probeVideoDuration(localVideoUrl)') < uploadBlock.indexOf("uploadCanvasMedia(file, 'video'"), 'VideoSourceRail should probe local metadata in parallel with upload')
assert.match(uploadBlock, /URL\.revokeObjectURL\(localVideoUrl\)/, 'VideoSourceRail should release the local metadata URL')
for (const label of ['画布', '上传', '历史']) {
  assert.match(sourceRail, new RegExp(label), `VideoSourceRail should render ${label}`)
}

for (const eventName of ['dragstart', 'drop', 'removeClip']) {
  assert.match(timeline, new RegExp(eventName), `VideoTimeline should support ${eventName}`)
}

assert.match(preview, /normalizePreviewRectToVideo/, 'VideoPreview should normalize fine erase rectangles')
assert.match(preview, /object-fit:\s*contain/, 'VideoPreview should show the whole source video with letterbox bars')
for (const pointerEvent of ['pointerdown', 'pointermove', 'pointerup']) {
  assert.match(preview, new RegExp(pointerEvent), `VideoPreview should handle ${pointerEvent}`)
}

assert.match(timeline, /box-sizing:\s*border-box/, 'VideoTimeline should include padding in its fixed modal row height')
assert.match(timeline, /height:\s*100%/, 'VideoTimeline should fit inside the modal timeline row instead of overflowing the viewport')

for (const label of ['字幕擦除', '选区擦除', '全域智能擦除', '高级水印/字幕擦除', '选区水印/字幕擦除', '全域水印/字幕擦除']) {
  assert.match(controls, new RegExp(label), `SubtitleEraseControls should render ${label}`)
}

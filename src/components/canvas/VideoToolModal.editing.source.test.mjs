import { includesUiText } from '../../i18n/sourceAssertions.mjs'
import { localizedPattern } from '../../i18n/sourceAssertions.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const modal = fs.readFileSync(new URL('./VideoToolModal.vue', import.meta.url), 'utf8')
const node = fs.readFileSync(new URL('./nodes/VideoNode.vue', import.meta.url), 'utf8')
const preview = fs.readFileSync(new URL('./video-tool/VideoPreview.vue', import.meta.url), 'utf8')
const timeline = fs.readFileSync(new URL('./video-tool/VideoTimeline.vue', import.meta.url), 'utf8')

test('editor exposes clip-only export, split controls and read-only duration', () => {
  for (const label of ['向左分割', '向右分割', '导出到画布', '导出到本地', '变速倍数', '音量增益']) assert.ok(includesUiText(modal, label))
  assert.match(modal, /<output>\{\{ getClipDuration\(selectedClip\)/)
  assert.match(modal, /selectedExportClips\(clips.value, selectedClip.value\?\.id\)/)
  assert.match(modal, /exportVideoTimeline\(\{ clips: snapshot \}\)/)
  assert.match(modal, /props.exportClipToCanvas\(\{ clips: snapshot/)
  assert.doesNotMatch(timeline, /Math.max\(60, duration/)
})

test('draft uses database load and versioned patch and close waits for acknowledgment', () => {
  assert.match(node, /getWorkflowNodesBatch\(saved.workflowId, \[props.id\]\)/)
  assert.match(node, /await patchWorkflowNode\(context.workflowId, props.id, \{ data: \{ videoEditDraft: draft \} \}, context.version\)/)
  assert.match(modal, /await draftWriter.flush\(\)[\s\S]*emit\('close'\)/)
  assert.match(modal, /VERSION_CONFLICT/)
  assert.match(modal, localizedPattern(/放弃并关闭/))
  assert.match(node, /await postWorkflowOps\(context.workflowId,[\s\S]*canvasStore.addNode\(node\)/)
})

test('preview applies gain and playback speed and preserves source-time seeking', () => {
  assert.match(preview, /video.playbackRate = props.clip\?\.playbackRate \|\| 1/)
  assert.match(preview, /Math.pow\(10, volumeDb \/ 20\)/)
  assert.match(preview, /video.preservesPitch = true/)
  assert.match(preview, /audioContext\?\.close\(\)/)
  assert.match(preview, /pendingSeek/)
  assert.match(preview, localizedPattern(/音量预览不可用/))
  assert.match(preview, /watch\(\[\(\) => props.clip\?\.id, \(\) => props.clip\?\.url\]/)
})

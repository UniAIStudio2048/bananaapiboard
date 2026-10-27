import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('connected reference audio matches the video node mention card behavior', () => {
  assert.match(source, /class="audio-reference-item[^"]*"[\s\S]*@click="insertAudioReferenceTag"/)
  assert.match(source, /@mouseenter="onAudioHoverStart\(inheritedAudioUrl, \$event\)"/)
  assert.match(source, /@mouseleave="onHoverEnd"/)
  assert.match(source, /class="audio-reference-icon"[\s\S]*♪/)
  assert.match(source, /class="audio-reference-tag"[\s\S]*@音频1/)
})

test('reference audio mention can be inserted and rendered as an audio tag chip', () => {
  assert.match(source, /function insertAudioReferenceTag\(\)/)
  assert.match(source, /const tag = '@音频1'/)
  assert.match(source, /restorePromptEditorSelection\(nextEditor, resultCursor, resultCursor\)/)
  assert.match(source, /highlightedMusicPromptSegments[\s\S]*@音频/)
  assert.match(source, /<PromptMediaTag[\s\S]*onAudioHoverStart/)
})

test('audio prompt placeholder is readable in the dark canvas theme', () => {
  assert.match(source, /\.prompt-textarea\s*\{[\s\S]*color:\s*var\(--canvas-text-primary, #fff\);/)
  assert.match(source, /\.prompt-textarea\.is-empty:empty::before\s*\{[\s\S]*color:\s*#ffffff;/)
  assert.match(source, /\.prompt-area\s*\{[\s\S]*border-bottom:\s*1px solid var\(--canvas-border-subtle, #2a2a2a\);/)
})

test('audio option hints are readable in both canvas themes', () => {
  assert.match(source, /<span class="option-hint">\{\{ sunoV6Operation\.id === 'sounds' \? '生成音效' : '生成音乐或处理已有音乐' \}\}<\/span>/)
  assert.doesNotMatch(source, /sunoV6Operation\.path \}\} ·/)
  assert.match(source, /\.option-hint\s*\{[\s\S]*color:\s*#ffffff;/)
  assert.match(source, /:root\.canvas-theme-light \.audio-node \.option-hint,[\s\S]*:root\.canvas-theme-light \.audio-config-panel \.option-hint\s*\{[\s\S]*color:\s*#57534e;/)
})

test('audio input handle shares the node wrapper coordinate system with the left add button', () => {
  const wrapperStart = source.indexOf('<div class="node-wrapper">')
  const targetHandle = source.indexOf('type="target"', wrapperStart)
  const leftAddButton = source.indexOf('class="node-add-btn node-add-btn-left"', wrapperStart)

  assert.notEqual(wrapperStart, -1)
  assert.notEqual(targetHandle, -1)
  assert.notEqual(leftAddButton, -1)
  assert.ok(targetHandle < leftAddButton)
  assert.match(source, /vue-flow__handle\.node-handle[\s\S]*min-width:\s*1px\s*!important/)
  assert.match(source, /vue-flow__handle\.target[\s\S]*left:\s*-34\.5px\s*!important/)
})

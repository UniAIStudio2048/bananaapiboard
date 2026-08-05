import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('stream content updates are throttled and flushed on done', () => {
  assert.match(source, /let streamContentTimer = null[\s\S]*?let pendingStreamContent = ''/)
  assert.match(source, /const flushStreamContent = \(\) => \{[\s\S]*?clearTimeout\(streamContentTimer\)[\s\S]*?messages\.value\[assistantMessageIndex\]\.content = pendingStreamContent/)
  assert.match(source, /onContent: \(chunk, fullContent\) => \{[\s\S]*?pendingStreamContent = fullContent[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?}, 40\)/)
  assert.match(source, /onDone: \(fullContent, result\) => \{[\s\S]*?flushStreamContent\(\)/)
})

test('media generation shows a generating state instead of skill text', () => {
  assert.match(source, /const generatingType = skillId === 'builtin-canvas-video-generate' \? 'video'[\s\S]*?: skillId === 'builtin-canvas-image-generate' \? 'image' : ''/)
  assert.match(source, /messages\.value\[assistantMessageIndex\]\.mediaGenerating = generatingType/)
  assert.match(source, /messages\.value\[assistantMessageIndex\]\.content = ''/)
  assert.match(source, /if \(!messages\.value\[assistantMessageIndex\]\.mediaGenerating\) \{[\s\S]*?'生成任务已提交，正在等待结果…'/)
  assert.match(source, /const applyGeneratedResult = \(result\) => \{[\s\S]*?delete messages\.value\[assistantMessageIndex\]\.mediaGenerating/)
  assert.match(source, /onDone: \(fullContent, result\) => \{[\s\S]*?delete messages\.value\[assistantMessageIndex\]\.mediaGenerating/)
})

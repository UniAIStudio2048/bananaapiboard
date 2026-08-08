import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8')

test('assistant input toolbar exposes a Skills market entry', () => {
  assert.match(source, /class="toolbar-btn icon-btn skills-market-trigger"/)
  assert.match(source, /title="选择并引用 Skill"/)
  assert.match(source, /<Box :size="16" aria-hidden="true"\s*\/>/)
  assert.match(source, /@click="\$emit\('open-skills', \$event\)"/)
  assert.doesNotMatch(source, /skills-market-label/)
  assert.match(source, /defineEmits\(\['close', 'width-change', 'start-canvas-pick', 'canvas-writeback', 'open-skills'\]\)/)
})

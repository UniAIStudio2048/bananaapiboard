import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')

assert.match(source, /function toggleLeftPanel\(panel\)/, 'Canvas should use a shared left-panel toggle helper')
assert.match(source, /function closeLeftPanels\(\)/, 'Canvas should use a shared left-panel close helper')

for (const [name, state] of [
  ['workflow', 'showWorkflowPanel'],
  ['asset', 'showAssetPanel'],
  ['history', 'showHistoryPanel']
]) {
  const functionMatch = source.match(new RegExp(`function open${name[0].toUpperCase()}${name.slice(1)}Panel\\(\\) \\{([\\s\\S]*?)\\n\\}`))
  assert.ok(functionMatch, `${name} panel opener should exist`)
  assert.match(functionMatch[1], new RegExp(`toggleLeftPanel\\('${name}'\\)`), `${name} panel opener should route through toggleLeftPanel`)
  assert.doesNotMatch(functionMatch[1], new RegExp(`${state}\\.value\\s*=\\s*!${state}\\.value`), `${name} panel should not toggle independently`)
}

const toggleBody = source.match(/function toggleLeftPanel\(panel\) \{([\s\S]*?)\n\}/)?.[1] || ''
for (const [name, state] of [
  ['workflow', 'showWorkflowPanel'],
  ['asset', 'showAssetPanel'],
  ['history', 'showHistoryPanel']
]) {
  assert.match(toggleBody, new RegExp(`${state}\\.value\\s*=\\s*panel\\s*===\\s*'${name}'\\s*&&\\s*!wasOpen`), `${name} panel should close when another left panel opens`)
}

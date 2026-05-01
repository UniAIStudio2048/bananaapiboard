import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasToolbar.vue'), 'utf8')

assert.match(source, /function closeToolbarPanels\(\)/, 'CanvasToolbar should centralize closing local flyout panels')

for (const functionName of ['handleOpenTemplates', 'openWorkflows', 'openAssets', 'openHistory', 'saveWorkflow', 'openProfilePanel']) {
  const functionMatch = source.match(new RegExp(`function ${functionName}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))
  assert.ok(functionMatch, `${functionName} should exist`)
  assert.match(functionMatch[1], /closeToolbarPanels\(\)/, `${functionName} should close other toolbar flyouts before opening its panel`)
}

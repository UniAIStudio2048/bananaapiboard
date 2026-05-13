import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readComponent(relativePath) {
  return readFileSync(join(__dirname, relativePath), 'utf8')
}

function cssBlock(source, selector) {
  const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('expanded video config panel uses a wider panel and taller prompt input', () => {
  const source = readComponent('VideoNode.vue')
  const expandedPanel = cssBlock(source, '.config-panel-expanded')
  const expandedPrompt = cssBlock(source, '.config-panel-expanded .prompt-input')

  assert.match(expandedPanel, /width:\s*70vw;/)
  assert.match(expandedPanel, /min-width:\s*70vw;/)
  assert.match(expandedPanel, /max-width:\s*calc\(100vw - 32px\);/)
  assert.match(expandedPanel, /height:\s*70vh;/)
  assert.match(expandedPanel, /max-height:\s*calc\(100vh - 32px\);/)
  assert.match(expandedPrompt, /min-height:\s*320px;/)
  assert.match(expandedPrompt, /max-height:\s*calc\(70vh - 220px\);/)
})

test('expanding the video config panel smoothly centers the selected node through viewport movement', () => {
  const source = readComponent('VideoNode.vue')

  assert.match(source, /const\s*\{[^}]*setViewport[^}]*getViewport[^}]*\}\s*=\s*useVueFlow\(\)/s)
  assert.match(source, /function centerNodeInViewport\(\)/)
  assert.match(source, /const\s+nodeCenterFlowX\s*=\s*\(nodeRect\.left - paneRect\.left \+ nodeRect\.width \/ 2 - viewport\.x\) \/ viewport\.zoom/)
  assert.match(source, /const\s+nodeCenterFlowY\s*=\s*\(nodeRect\.top - paneRect\.top \+ nodeRect\.height \/ 2 - viewport\.y\) \/ viewport\.zoom/)
  assert.match(source, /const\s+EXPANDED_CONFIG_PANEL_NODE_ZOOM\s*=\s*1/)
  assert.match(source, /const\s+targetZoom\s*=\s*EXPANDED_CONFIG_PANEL_NODE_ZOOM/)
  assert.match(source, /x:\s*paneRect\.width \/ 2 - nodeCenterFlowX \* targetZoom/)
  assert.match(source, /y:\s*paneRect\.height \/ 2 - nodeCenterFlowY \* targetZoom/)
  assert.match(source, /setViewport\(\s*\{[\s\S]*?zoom:\s*targetZoom[\s\S]*?\},\s*\{\s*duration:\s*420\s*\}\s*\)/)
  assert.match(source, /if\s*\(nextExpanded\)\s*\{[\s\S]*?centerNodeInViewport\(\)/)
})

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

test('expanded config panels keep light theme controls readable after teleporting to body', () => {
  for (const component of ['ImageNode.vue', 'VideoNode.vue']) {
    const source = readComponent(component)

    assert.match(source, /:root\.canvas-theme-light \.config-panel-expanded \.panel-frames-label\s*\{[\s\S]*color:\s*#57534e;/)
    assert.match(source, /:root\.canvas-theme-light \.config-panel-expanded \.prompt-input,[\s\S]*color:\s*#1c1917;/)
    assert.match(source, /:root\.canvas-theme-light \.config-panel-expanded \.model-selector-trigger,[\s\S]*\.ratio-selector,[\s\S]*\.param-chip\s*\{[\s\S]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.04\);/)
    assert.match(source, /:root\.canvas-theme-light \.config-panel-expanded \.sora2-collapse-trigger[\s\S]*color:\s*#78716c;/)
    assert.match(source, /:root\.canvas-theme-light \.config-panel-expanded \.sora2-option-label\s*\{[\s\S]*color:\s*#44403c;/)
  }

  const imageSource = readComponent('ImageNode.vue')
  assert.match(imageSource, /:root\.canvas-theme-light \.config-panel-expanded \.preset-selector-trigger,[\s\S]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.04\);/)
  assert.match(imageSource, /:root\.canvas-theme-light \.config-panel-expanded \.preset-dropdown-list\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.98\);/)
  assert.match(imageSource, /:root\.canvas-theme-light \.config-panel-expanded \.preset-item-label\s*\{[\s\S]*color:\s*#1c1917;/)
  assert.match(imageSource, /:root\.canvas-theme-light \.config-panel-expanded \.count-display\.clickable\s*\{[\s\S]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.04\);/)

  const videoSource = readComponent('VideoNode.vue')
  assert.match(videoSource, /:root\.canvas-theme-light \.config-panel-expanded \.duration-select,[\s\S]*\.count-display\.clickable,[\s\S]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.04\);/)
  assert.match(videoSource, /:root\.canvas-theme-light \.config-panel-expanded \.duration-select-label,[\s\S]*\.count-display,[\s\S]*color:\s*#78716c;/)
  assert.match(videoSource, /:root\.canvas-theme-light \.config-panel-expanded \.duration-select option\s*\{[\s\S]*background:\s*#ffffff;/)
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

test('expanded config panels support wheel zoom outside prompt editors', () => {
  for (const component of ['ImageNode.vue', 'VideoNode.vue', 'AudioNode.vue']) {
    const source = readComponent(component)

    assert.match(source, /import\s*\{\s*createConfigPanelWheelZoom\s*\}\s*from\s*'@\/utils\/configPanelWheelZoom'/)
    assert.match(source, /const\s*\{[^}]*configPanelScale[^}]*handleConfigPanelWheel[^}]*resetConfigPanelScale[^}]*\}\s*=\s*createConfigPanelWheelZoom\(\)/)
    assert.match(source, /:style="\{\s*'--config-panel-scale':\s*configPanelScale\s*\}"/)
    assert.match(source, /@wheel="handleConfigPanelWheel\(\$event,\s*isConfigPanelExpanded\)"/)
    assert.match(source, /transform:\s*translate\(-50%,\s*-50%\)\s*scale\(var\(--config-panel-scale,\s*1\)\);/)
  }

  const textSource = readComponent('TextNode.vue')
  assert.match(textSource, /import\s*\{\s*createConfigPanelWheelZoom\s*\}\s*from\s*'@\/utils\/configPanelWheelZoom'/)
  assert.match(textSource, /:style="\{\s*'--config-panel-scale':\s*configPanelScale\s*\}"/)
  assert.match(textSource, /@wheel="handleConfigPanelWheel\(\$event,\s*isConfigPanelExpanded\)"/)
  assert.match(textSource, /\.llm-config-panel-expanded\s*\{[\s\S]*transform:\s*translate\(-50%,\s*-50%\)\s*scale\(var\(--config-panel-scale,\s*1\)\);/)

  const zoomSource = readFileSync(join(__dirname, '../../../utils/configPanelWheelZoom.js'), 'utf8')
  assert.match(zoomSource, /CONFIG_PANEL_WHEEL_SPEED\s*=\s*0\.0015/)
  assert.match(zoomSource, /\[contenteditable="true"\]/)
  assert.match(zoomSource, /event\.preventDefault\(\)/)
})

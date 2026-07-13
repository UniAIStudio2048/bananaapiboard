import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./canvas-stress-playwright.mjs', import.meta.url), 'utf8')

assert.match(source, /createCanvasStressSession/)
assert.match(source, /workflow_tab_session/)
assert.match(source, /mountedNodes/)
assert.match(source, /videoElements/)
assert.match(source, /mediaRequestCount/)
assert.match(source, /nodeDragMoved/)
assert.match(source, /maxMountedNodes/)
assert.match(source, /nodeCount/)
assert.match(source, /1500/)
assert.match(source, /CANVAS_STRESS_ENFORCE_TIMING/)
assert.match(source, /options\.enforceTiming/)
assert.match(source, /CANVAS_STRESS_SHOW_MAP/)
assert.match(source, /canvas-map-toggle-btn/)
assert.match(source, /canvasOnboardingCompleted/)
assert.match(source, /PLAYWRIGHT_MODULE_PATH/)
assert.match(source, /import\(playwrightModulePath\)/)
assert.match(source, /route\('\*\*\/\*'/)
assert.match(source, /path\.startsWith\('\/api\/'\)/)
assert.match(source, /locator\('\.vue-flow'\)\.first\(\)\.waitFor/)

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(__dirname, '../../..')

function read(relativePath) {
  return readFileSync(join(srcDir, relativePath), 'utf8')
}

test('Canvas provides the persisted prompt-input fixed-scale preference to canvas nodes', () => {
  const source = read('views/Canvas.vue')

  assert.match(source, /import\s+\{[\s\S]*buildPromptInputScaleStyle[\s\S]*getPromptInputFixedScaleDefault[\s\S]*resolvePromptInputFixedScalePreference[\s\S]*\}\s+from '@\/utils\/canvasPromptInputScale'/)
  assert.match(source, /const promptInputFixedScale = ref\(false\)/)
  assert.match(source, /provide\('canvasPromptInputScale', canvasPromptInputScale\)/)
  assert.match(source, /function loadPromptInputFixedScalePreference\(\)/)
  assert.match(source, /async function savePromptInputFixedScalePreference\(enabled\)/)
  assert.match(source, /handleOnboardingModeSelect\(mode, promptFixedScale(?:\s*=\s*getPromptInputFixedScaleDefault\(mode\))?\)/)
  assert.match(source, /:prompt-input-fixed-scale="promptInputFixedScale"/)
  assert.match(source, /@prompt-input-fixed-scale-change="savePromptInputFixedScalePreference"/)
})

test('CanvasBoard publishes prompt-panel scale variables before selected node panels mount', () => {
  const source = read('components/canvas/CanvasBoard.vue')

  assert.match(source, /import\s+\{ buildPromptInputScaleStyle \}\s+from '@\/utils\/canvasPromptInputScale'/)
  assert.match(source, /const canvasPromptPanelScaleStyle = computed\(\(\) => buildPromptInputScaleStyle\(\{/)
  assert.match(source, /enabled:\s*true/)
  assert.match(source, /zoom:\s*canvasStore\.viewport\?\.zoom/)
  assert.match(source, /:style="canvasPromptPanelScaleStyle"/)
})

test('profile settings expose a persisted prompt-input fixed-scale memory switch near edge preferences', () => {
  const source = read('components/canvas/UserProfilePanel.vue')

  assert.match(source, /promptInputFixedScaleEnabled/)
  assert.match(source, /togglePromptInputFixedScale/)
  assert.match(source, /onboarding\.settings\.promptInputFixedScale/)
  assert.match(source, /onboarding\.settings\.promptInputFixedScaleDesc/)
  assert.match(source, /promptInputFixedScale:\s*enabled/)
})

test('onboarding lets users adjust prompt-input fixed-scale after choosing either interaction mode', () => {
  const source = read('components/canvas/OnboardingGuide.vue')

  assert.match(source, /promptInputFixedScale:/)
  assert.match(source, /promptInputFixedScaleChange/)
  assert.match(source, /selectedPromptInputFixedScale/)
  assert.match(source, /getPromptInputFixedScaleDefault\(mode\)/)
  assert.match(source, /onboarding\.interactionMode\.promptInputFixedScale/)
})

test('all ordinary media prompt panels opt into fixed scale without scaling only the editor text', () => {
  for (const [file, panelClass, inputClass] of [
    ['components/canvas/nodes/ImageNode.vue', 'config-panel', 'prompt-input'],
    ['components/canvas/nodes/VideoNode.vue', 'config-panel', 'prompt-input'],
    ['components/canvas/nodes/TextNode.vue', 'llm-config-panel', 'llm-input'],
    ['components/canvas/nodes/AudioNode.vue', 'config-panel', 'prompt-textarea']
  ]) {
    const source = read(file)
    assert.match(source, /inject\('canvasPromptInputScale'/, `${file} should inject the canvas prompt scale preference`)
    assert.match(source, /isPromptInputFixedScale/, `${file} should expose a fixed-scale active computed`)
    assert.match(source, /promptInputFixedScaleStyle/, `${file} should expose fixed-scale CSS variables`)
    assert.match(
      source,
      new RegExp(`class="${panelClass}[^"]*"[\\s\\S]{0,600}'canvas-fixed-prompt-panel': isPromptInputFixedScale && !isConfigPanelExpanded[\\s\\S]{0,300}:style="\\[\\{ '--config-panel-scale': configPanelScale \\}, promptInputFixedScaleStyle\\]"`),
      `${file} should apply the shared fixed-scale class and style to the parameter panel`
    )
    assert.doesNotMatch(source, /canvas-fixed-prompt-input/, `${file} should not scale only the inner prompt editor`)
    assert.match(source, new RegExp(`class="${inputClass}`), `${file} should still render the original prompt input class`)
  }
})

test('global canvas CSS cancels VueFlow zoom for fixed-scale prompt panels', () => {
  const source = read('styles/canvas.css')

  assert.match(source, /\.config-panel\.canvas-fixed-prompt-panel/)
  assert.match(source, /\.llm-config-panel\.canvas-fixed-prompt-panel/)
  assert.match(source, /transform:\s*translateX\(-50%\)\s+scale\(var\(--canvas-prompt-input-fixed-scale,\s*1\)\)\s*!important;/)
  assert.match(source, /transform-origin:\s*top center;/)
  assert.match(source, /animation:\s*canvasFixedPromptPanelEnter\s+0\.14s\s+ease-out\s+both\s*!important;/)
  assert.match(source, /@keyframes canvasFixedPromptPanelEnter/)
  const enterAnimation = source.match(/@keyframes canvasFixedPromptPanelEnter\s*\{[\s\S]*?\n\}/)?.[0] || ''
  assert.match(enterAnimation, /opacity:\s*0;/)
  assert.match(enterAnimation, /translate:\s*0\s+-6px;/)
  assert.doesNotMatch(enterAnimation, /transform:/, 'fixed panel entry animation should not animate scale')
})

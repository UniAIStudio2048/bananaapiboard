import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const componentSource = fs.readFileSync(new URL('./PromptTranslateButton.vue', import.meta.url), 'utf8')

const nodeFiles = [
  ['./nodes/ImageNode.vue', 'promptText', 'points-cost-display'],
  ['./nodes/VideoNode.vue', 'promptText', 'points-cost-display'],
  ['./nodes/AudioNode.vue', 'musicPrompt', 'points-badge'],
  ['./nodes/TextNode.vue', 'llmInputText', 'points-cost-display']
]

test('translation button has one action and calls the dedicated prompt translation API', () => {
  assert.match(componentSource, /translatePrompt/)
  assert.match(componentSource, /翻译提示词（中译英 \/ 英译中）/)
  assert.match(componentSource, /class="prompt-translate-icon"/)
  assert.match(componentSource, /https:\/\/filescos\.nananobanana\.cn\/_global_\/ui-assets\/canvas-icons\/6cf6f931-a6b1-4ce4-b566-2949c0c8980f\.png/)
  assert.match(componentSource, /https:\/\/filescos\.nananobanana\.cn\/_global_\/ui-assets\/canvas-icons\/d417c9eb-d6e4-4b86-8470-20e5bc070c94\.png/)
  assert.match(componentSource, /:src="translationIconSrc"/)
  assert.match(componentSource, /new MutationObserver/)
  assert.match(componentSource, /object-fit: contain/)
  assert.match(componentSource, /class="prompt-translate-button nodrag"/)
  assert.match(componentSource, /@pointerdown\.stop/)
  assert.match(componentSource, /color: #cbd5e1/)
  assert.match(componentSource, /pointer-events: none/)
  assert.match(componentSource, /<style>\s*\.prompt-translate-button/)
  assert.match(componentSource, /:root\.canvas-theme-light \.prompt-translate-button/)
  assert.match(componentSource, /background: #fff/)
  assert.doesNotMatch(componentSource, /prompt-translate-icon-light|prompt-translate-icon-dark/)
  assert.doesNotMatch(componentSource, /select|dropdown|menu/i)
})

for (const [relativePath, promptRef, costMarker] of nodeFiles) {
  test(`${relativePath} places prompt translation before the points display`, () => {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.match(source, new RegExp(`<PromptTranslateButton[\\s\\S]*?:text="${promptRef}"[\\s\\S]*?@translated=`))
    assert.ok(source.indexOf('<PromptTranslateButton') < source.lastIndexOf(costMarker))
  })
}

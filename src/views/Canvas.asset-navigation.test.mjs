import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compile } from '@vue/compiler-dom'
import * as Vue from 'vue'
import postcss from 'postcss'

const canvasSource = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')
const assetSource = readFileSync(new URL('../components/canvas/AssetPanel.vue', import.meta.url), 'utf8')
const toolbarTemplate = canvasSource.match(/<CanvasToolbar\b[\s\S]*?\/>/)[0]
const renderToolbar = new Function('Vue', compile(toolbarTemplate, {
  mode: 'function', isCustomElement: tag => tag === 'CanvasToolbar'
}).code)(Vue)

function toolbarProps(showAssetPanel, cleanCanvasMode = false) {
  return renderToolbar({ showAssetPanel, cleanCanvasMode, openSaveDialog() {}, openShareWorkflow() {}, CanvasToolbar: 'div' }, []).props
}

test('opening assets hides and disables navigation, repeated closing restores it', () => {
  for (const opened of [false, true, false, true, false]) {
    const props = toolbarProps(opened)
    assert.equal(props.class?.includes('is-asset-panel-open') || false, opened)
    assert.equal(props['aria-hidden'], opened)
    assert.equal(props.inert, opened)
  }
})

test('closing assets while in clean mode keeps navigation unavailable', () => {
  const props = toolbarProps(false, true)
  assert.equal(props['aria-hidden'], true)
  assert.equal(props.inert, true)
})

test('asset navigation uses the left slide animation and honors reduced motion', () => {
  const styles = postcss.parse(canvasSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1])
  const rules = []
  styles.walkRules(rule => {
    if (rule.selector.includes('.canvas-toolbar.is-asset-panel-open')) rules.push(rule)
  })
  const slideRule = rules.find(rule => rule.nodes.some(node => node.prop === 'translate'))
  assert.ok(slideRule, 'asset navigation needs the existing slide-out rule')
  for (const [property, value] of [['opacity', '0'], ['visibility', 'hidden'], ['pointer-events', 'none']]) {
    assert.ok(slideRule.nodes.some(node => node.prop === property && node.value === value))
  }
  assert.ok(rules.some(rule => rule.parent.params === '(prefers-reduced-motion: reduce)' &&
    rule.nodes.some(node => node.prop === 'transition' && node.value === 'none')))
})

test('asset sidebar sits at the viewport left edge on desktop and narrow screens', () => {
  const styles = postcss.parse(assetSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1])
  let containerRules = 0
  styles.walkRules('.asset-panel-container', rule => {
    const left = rule.nodes.find(node => node.prop === 'left')
    assert.equal(left?.value, '0', `incorrect left edge in ${rule.parent.params || 'desktop'} layout`)
    containerRules += 1
  })
  assert.equal(containerRules, 2)
  const narrowPanel = []
  styles.walkRules('.asset-panel', rule => {
    if (rule.parent.params === '(max-width: 900px)') narrowPanel.push(rule)
  })
  assert.ok(narrowPanel.some(rule => rule.nodes.some(node => node.prop === 'max-width' && node.value === 'min(680px, 100%)')),
    'directory width must stay within narrow viewports')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileStyle } from '@vue/compiler-sfc'
import postcss from 'postcss'

// Vue 3 scoped 样式中 `:global(.canvas-theme-light) .menu` 会被编译成裸的 `.canvas-theme-light`，
// 后代选择器整段丢失：主题覆盖不生效，还会把背景/颜色写到 <html> 上。
const srcDir = fileURLToPath(new URL('..', import.meta.url))
const THEME_ROOT = /^(html|body|:root)?(\.(canvas-theme-light|canvas-theme-dark|theme-light|theme-dark|dark|light))+$/

function vueFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : vueFiles(full)
    return name.endsWith('.vue') ? [full] : []
  })
}

test('scoped 样式中的主题覆盖不能被编译成裸的主题根选择器', () => {
  const offenders = []
  for (const file of vueFiles(srcDir)) {
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
    for (const style of descriptor.styles) {
      if (!style.scoped || style.lang) continue
      const { code } = compileStyle({ source: style.content, id: 'data-v-test', scoped: true, filename: file })
      postcss.parse(code).walkRules(rule => {
        for (const selector of rule.selectors) {
          if (THEME_ROOT.test(selector.trim())) offenders.push(`${relative(srcDir, file)}: ${selector.trim()}`)
        }
      })
    }
  }
  assert.deepEqual(offenders, [])
})

test('画布内浮层面板提供白昼模式覆盖', () => {
  const required = {
    'components/canvas/BreakdownReferenceDetails.vue': ['.reference-body'],
    'components/canvas/AudioEditorModal.vue': ['.audio-editor', '.trim-timeline', '.audio-editor-actions'],
    'components/canvas/VoicePresetPicker.vue': ['.voice-picker', '.voice-row', '.voice-search', '.delete-confirm-card']
  }
  const missing = []
  for (const [file, classes] of Object.entries(required)) {
    const { descriptor } = parse(readFileSync(join(srcDir, file), 'utf8'), { filename: file })
    const selectors = descriptor.styles.flatMap(style => {
      const { code } = compileStyle({ source: style.content, id: 'data-v-test', scoped: style.scoped, filename: file })
      const list = []
      postcss.parse(code).walkRules(rule => list.push(...rule.selectors.map(s => s.trim())))
      return list
    })
    for (const cls of classes) {
      if (!selectors.some(s => /canvas-theme-light\s/.test(s) && s.includes(cls))) missing.push(`${file} ${cls}`)
    }
  }
  assert.deepEqual(missing, [])
})

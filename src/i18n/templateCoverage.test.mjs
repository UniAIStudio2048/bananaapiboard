import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { parse } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'

async function vueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    return entry.isDirectory() ? vueFiles(path) : entry.name.endsWith('.vue') ? [path] : []
  }))).flat()
}

test('Vue templates route static Chinese copy and accessibility labels through translations', async () => {
  const failures = []
  for (const file of await vueFiles(new URL('../', import.meta.url))) {
    const source = await readFile(file, 'utf8')
    const { descriptor } = parse(source)
    if (!descriptor.template) continue
    const ast = parseTemplate(descriptor.template.content)
    function visit(node) {
      if (node.type === 2 && /\p{Script=Han}/u.test(node.content)) failures.push(`${file.pathname}:${node.loc.start.line} ${node.content.trim()}`)
      for (const prop of node.props || []) {
        if (prop.type === 6 && /^(title|placeholder|alt|aria-label|label|description|empty-text|loading-text)$/.test(prop.name) && /\p{Script=Han}/u.test(prop.value?.content || '')) failures.push(`${file.pathname}:${prop.loc.start.line} ${prop.name}`)
      }
      for (const child of node.children || []) visit(child)
    }
    visit(ast)
  }
  assert.deepEqual(failures, [])
})

test('React editor templates translate static text and accessibility labels', async () => {
  const { parse: parseScript } = await import('@babel/parser')
  const directory = new URL('../components/canvas/editor/', import.meta.url)
  const failures = []
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.tsx'))) {
    const source = await readFile(new URL(name, directory), 'utf8')
    const ast = parseScript(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
    function visit(node) {
      if (!node?.type) return
      if (node.type === 'JSXText' && /\p{Script=Han}/u.test(node.value)) failures.push(`${name}:${node.loc.start.line} ${node.value.trim()}`)
      if (node.type === 'JSXAttribute' && /^(title|placeholder|alt|aria-label)$/.test(node.name.name) && node.value?.type === 'StringLiteral' && /\p{Script=Han}/u.test(node.value.value)) failures.push(`${name}:${node.loc.start.line} ${node.name.name}`)
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'comments'].includes(key)) continue
        if (Array.isArray(value)) value.forEach(visit)
        else if (value?.type) visit(value)
      }
    }
    visit(ast)
  }
  assert.deepEqual(failures, [])
})

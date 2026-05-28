import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readNode(name) {
  return readFileSync(join(__dirname, name), 'utf8')
}

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('contenteditable prompt placeholders are overlays so the caret starts in the editable text area', () => {
  for (const [file, inputSelector, placeholderSelector] of [
    ['ImageNode.vue', '.prompt-input', '.prompt-input.is-empty:empty::before'],
    ['VideoNode.vue', '.prompt-input', '.prompt-input.is-empty:empty::before'],
    ['TextNode.vue', '.editor-content', '.editor-content:empty:before'],
    ['TextNode.vue', '.llm-input', '.llm-input.is-empty:empty::before'],
    ['AudioNode.vue', '.prompt-textarea', '.prompt-textarea.is-empty:empty::before']
  ]) {
    const source = readNode(file)
    const input = cssBlock(source, inputSelector)
    const placeholder = cssBlock(source, placeholderSelector)

    assert.match(input, /position:\s*relative;/, `${file} editor should position its placeholder overlay`)
    assert.match(placeholder, /position:\s*absolute;/, `${file} placeholder should not participate in text layout`)
    assert.match(placeholder, /pointer-events:\s*none;/, `${file} placeholder should not intercept clicks`)
  }
})

test('contenteditable prompt placeholders use :empty so they hide as soon as DOM has any text, even if reactive state lags', () => {
  // 防御性测试：placeholder 选择器必须包含 :empty，
  // 这样即使 promptText/musicPrompt/llmInputText 因为某些边界场景没及时同步，
  // 只要用户在 contenteditable 里输入了内容（DOM 不再为空），灰色提示文字就不会与用户输入重叠
  for (const [file, placeholderSelector] of [
    ['ImageNode.vue', '.prompt-input.is-empty:empty::before'],
    ['VideoNode.vue', '.prompt-input.is-empty:empty::before'],
    ['TextNode.vue', '.llm-input.is-empty:empty::before'],
    ['AudioNode.vue', '.prompt-textarea.is-empty:empty::before']
  ]) {
    const source = readNode(file)
    assert.ok(source.includes(placeholderSelector), `${file} placeholder selector must include :empty guard (${placeholderSelector})`)
  }
})

test('audio prompt editor renders text through Vue-managed segments instead of direct text nodes', () => {
  // AudioNode uses the same contenteditable prompt utilities as ImageNode/VideoNode.
  // Those utilities remove direct text nodes after input, so the rendered prompt
  // content must live inside Vue-managed span segments.
  const source = readNode('AudioNode.vue')
  const editorMatch = source.match(/<div\s+[\s\S]*?ref="promptTextareaRef"[\s\S]*?<\/div>/)
  assert.ok(editorMatch, 'AudioNode should render a prompt editor')
  const editor = editorMatch[0]

  assert.match(editor, /:key="promptEditorRenderKey"/, 'AudioNode editor should remount when browser mutates contenteditable DOM')
  assert.match(editor, /v-for="\([\s\S]*?\)\s+in\s+highlightedMusicPromptSegments"/, 'AudioNode should render prompt text through managed segments')
  assert.doesNotMatch(editor, /\{\{\s*musicPrompt\s*\}\}/, 'AudioNode should not render musicPrompt as a direct text node')
})

test('clearing prompt via backspace bumps renderKey to force Vue to remount the editor', () => {
  // 防御性测试：当 contenteditable 内容从非空被 backspace 清空时，
  // 浏览器可能已经移除/修改 Vue 管理的 <span>，留下 <br> 等元素，使得
  // Vue 的 vnode.el 引用失效。下一次组件 patch 时会抛出
  // "Cannot set properties of null (setting 'vnode')"，错误向上冒泡到
  // vue-flow，整棵节点/连线渲染都会停摆，表现为节点无法拖动 + 连线错位。
  //
  // 修复方案：在输入处理函数中检测「非空 → 空」的过渡，bump renderKey，
  // 让 Vue 完全卸载旧的 prompt-input 子树，避免访问失效 vnode。
  for (const [file, inputHandler, renderKeyName] of [
    ['ImageNode.vue', 'handlePromptInput', 'promptEditorRenderKey'],
    ['VideoNode.vue', 'handlePromptInput', 'promptEditorRenderKey'],
    ['TextNode.vue', 'handleLLMInput', 'llmInputRenderKey'],
    ['AudioNode.vue', 'handleMusicInput', 'promptEditorRenderKey']
  ]) {
    const source = readNode(file)
    const fnMatch = source.match(new RegExp(`function\\s+${inputHandler}\\s*\\([\\s\\S]*?\\n\\}`))
    assert.ok(fnMatch, `${file} should define ${inputHandler}`)
    const body = fnMatch[0]
    assert.match(body, /wasNonEmpty/, `${file} ${inputHandler} should track previous non-empty state`)
    assert.match(
      body,
      new RegExp(`${renderKeyName}\\.value\\s*\\+=\\s*1`),
      `${file} ${inputHandler} should bump ${renderKeyName} when content becomes empty`
    )
    assert.match(
      body,
      /if\s*\(\s*wasNonEmpty\s*&&\s*!(?:text|text\.trim\(\))\s*\)/,
      `${file} ${inputHandler} should guard the renderKey bump with the becoming-empty transition`
    )
  }
})

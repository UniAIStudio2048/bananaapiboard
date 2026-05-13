import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readNode(name) {
  return readFileSync(join(__dirname, name), 'utf8')
}

// 防御性测试：当 contenteditable 提示词输入框包含 @图片1 等媒体引用 chip 时，
// 中文输入法 (IME) 在 composition 期间会持续触发 input 事件、且 event.isComposing === true。
// 此时若仍然执行 serializePromptEditorContent + restorePromptEditorSelection，会破坏
// IME 临时拼音文本节点和选区，导致：
//   1) 输入法面板候选词被打断，无法正常输入文字
//   2) compositionend 前后各回写一次，输入 1 个标点会变成 2 个
//   3) IME 留下的孤立 <br> 被序列化成 \n，自动空格换行
// 因此每个媒体提示词输入框都必须：
//   - 在 input handler 入口检查 event.isComposing 或本地 isComposing 标志，命中则直接 return
//   - 在 contenteditable 上绑定 @compositionstart 与 @compositionend
//   - compositionend 后再统一调用一次 input handler 同步最终值
const cases = [
  {
    file: 'ImageNode.vue',
    handler: 'handlePromptInput',
    composeStart: 'handlePromptCompositionStart',
    composeEnd: 'handlePromptCompositionEnd',
    flag: 'isPromptInputComposing'
  },
  {
    file: 'VideoNode.vue',
    handler: 'handlePromptInput',
    composeStart: 'handlePromptCompositionStart',
    composeEnd: 'handlePromptCompositionEnd',
    flag: 'isPromptInputComposing'
  },
  {
    file: 'TextNode.vue',
    handler: 'handleLLMInput',
    composeStart: 'handleLLMCompositionStart',
    composeEnd: 'handleLLMCompositionEnd',
    flag: 'isLLMInputComposing'
  },
  {
    file: 'AudioNode.vue',
    handler: 'handleMusicInput',
    composeStart: 'handleMusicCompositionStart',
    composeEnd: 'handleMusicCompositionEnd',
    flag: 'isMusicInputComposing'
  }
]

test('media prompt editors guard against IME composition events to keep Chinese input working when @ media mentions exist', () => {
  for (const { file, handler, composeStart, composeEnd, flag } of cases) {
    const source = readNode(file)

    const fnMatch = source.match(new RegExp(`function\\s+${handler}\\s*\\(event\\)\\s*\\{([\\s\\S]*?)\\n\\}`))
    assert.ok(fnMatch, `${file} should define ${handler}(event)`)
    const body = fnMatch[1]
    assert.match(
      body,
      new RegExp(`if\\s*\\(\\s*${flag}\\s*\\|\\|\\s*event\\?\\.isComposing\\s*\\)\\s*return`),
      `${file} ${handler} must short-circuit when IME composition is active`
    )

    assert.match(
      source,
      new RegExp(`function\\s+${composeStart}\\s*\\(\\s*\\)\\s*\\{[\\s\\S]*?${flag}\\s*=\\s*true`),
      `${file} should set ${flag}=true on compositionstart`
    )
    assert.match(
      source,
      new RegExp(`function\\s+${composeEnd}\\s*\\(event\\)\\s*\\{[\\s\\S]*?${flag}\\s*=\\s*false[\\s\\S]*?${handler}\\(event\\)`),
      `${file} should clear ${flag} and replay ${handler}(event) on compositionend`
    )

    assert.match(source, new RegExp(`@compositionstart="${composeStart}"`),
      `${file} contenteditable must bind @compositionstart`)
    assert.match(source, new RegExp(`@compositionend="${composeEnd}"`),
      `${file} contenteditable must bind @compositionend`)
  }
})

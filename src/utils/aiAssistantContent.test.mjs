import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAssistantContent } from './aiAssistantContent.js'

test('parses and hides structured choices', () => {
  const result = parseAssistantContent('请确认：\n<ui_choices>{"question":"请选择","options":[{"label":"生成","value":"1"},"继续"],"allow_input":true}</ui_choices>')
  assert.equal(result.content, '请确认：\n')
  assert.deepEqual(result.choices, {
    question: '请选择',
    options: [{ label: '生成', value: '1' }, { label: '继续', value: '继续' }],
    allowInput: true,
    inputPlaceholder: '输入自定义要求'
  })
})

test('falls back to original content for malformed or incomplete metadata', () => {
  const malformed = '<ui_choices>{bad}</ui_choices>'
  assert.deepEqual(parseAssistantContent(malformed), { content: malformed, choices: null })
  const incomplete = '<ui_choices>{"options":[]}</ui_choices>'
  assert.deepEqual(parseAssistantContent(incomplete), { content: incomplete, choices: null })
  const unclosed = '<ui_choices>{"options":["A"]}'
  assert.deepEqual(parseAssistantContent(unclosed), { content: unclosed, choices: null })
})

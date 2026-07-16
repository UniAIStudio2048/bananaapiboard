import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SeedanceCharacterPanel.vue', import.meta.url), 'utf8')

test('真人认证上传入口直接打开扫码流程并使用默认分组名称', () => {
  const handler = source.match(/async function triggerFaceVerifyUpload\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(handler, /supportsLiveness\.value/)
  assert.match(handler, /createGroupType\.value = 'LivenessFace'/)
  assert.match(handler, /createGroupForm\.value = \{ Name: '默认真人人像分组', Description: '' \}/)
  assert.match(handler, /showCreateGroupModal\.value = true/)
  assert.match(handler, /await handleCreateGroupLiveness\(\)/)
  assert.doesNotMatch(handler, /checkFaceVerifyStatus/)
  assert.doesNotMatch(handler, /triggerUpload\(\)/)
})

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowShareDialog.vue'), 'utf8')

assert.match(source, /const needsConfirmation = computed\(\(\) => \{[\s\S]*?selectedMode\.value !== 'disabled'[\s\S]*?\}\)/)
assert.match(
  source,
  /if \(!canManage\.value \|\| !hasChanges\.value \|\| \(needsConfirmation\.value && !confirmed\.value\) \|\| saving\.value\) return/,
  '保存只应在需要确认且尚未勾选时被阻止'
)
assert.match(source, /:disabled="saving \|\| loading \|\| !hasChanges \|\| \(needsConfirmation && !confirmed\)"/)
assert.match(source, /watch\([\s\S]*?,\s*\{\s*immediate: true\s*\}\s*\)/)
assert.match(source, /提示词、参数、素材及结果将公开，后续成功保存的修改也会公开/)
assert.match(source, /只读不防复制，关闭或重置链接无法收回已获取的内容和副本/)

console.log('WorkflowShareDialog confirmation contract tests passed')

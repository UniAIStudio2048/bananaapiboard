import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./workflow.js', import.meta.url), 'utf8')
const ast = parse(source, { sourceType: 'module' })
const declaration = ast.program.body
  .map(item => item.declaration || item)
  .find(item => item.type === 'FunctionDeclaration' && item.id?.name === 'normalizeLoadedWorkflow')

test('load workflow normalizes collaboration metadata returned by the legacy API', () => {
  assert.ok(declaration, 'workflow API should define normalizeLoadedWorkflow')
  const normalizeLoadedWorkflow = runInNewContext(`(${source.slice(declaration.start, declaration.end)})`)
  const workflow = normalizeLoadedWorkflow({
    id: 'wf-1',
    collab_revision: 7,
    collab_epoch: 'epoch-1'
  })
  assert.equal(workflow.collabRevision, 7)
  assert.equal(workflow.collabEpoch, 'epoch-1')
})

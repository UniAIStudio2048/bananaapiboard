import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const code = source.slice(source.indexOf('const aspectRatios = ['), source.indexOf('// 监听模型变化，如果模型不支持1K'))
function options(model) {
  return vm.runInNewContext(code + '\navailableImageAspectRatios', {
    computed: fn => fn(), modelLookupList: { value: [{ value: 'test', ...model }] }, selectedModel: { value: 'test' }
  })
}

test('canvas exposes configured sunburst extra ratios without adding them to other models', () => {
  const extra = ['9:21', '1:2', '2:1', '1:3', '3:1']
  assert.deepEqual(Array.from(options({ aspectRatios: ['1:1', ...extra] }), x => x.value), ['1:1', ...extra])
  assert.equal(options({}).some(x => extra.includes(x.value)), false)
})

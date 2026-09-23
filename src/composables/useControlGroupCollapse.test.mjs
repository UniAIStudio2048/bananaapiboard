import test from 'node:test'
import assert from 'node:assert/strict'
import { useControlGroupCollapse } from './useControlGroupCollapse.js'

test('点击收起、悬停临时展开、点击固定展开各自独立', () => {
  const top = useControlGroupCollapse()
  const bottom = useControlGroupCollapse()

  assert.equal(top.expanded.value, true)
  top.toggle()
  assert.equal(top.expanded.value, false)
  assert.equal(bottom.expanded.value, true)

  top.enter()
  assert.equal(top.expanded.value, true)
  top.leave()
  assert.equal(top.expanded.value, false)

  top.enter()
  top.toggle()
  top.leave()
  assert.equal(top.expanded.value, true)
  top.toggle()
  assert.equal(top.expanded.value, false)
})

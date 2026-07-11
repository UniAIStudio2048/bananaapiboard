import assert from 'node:assert/strict'

import { createCanvasUploadCancellationRegistry } from './canvasUploadCancellation.js'

const registry = createCanvasUploadCancellationRegistry()
const first = registry.begin('node-1', 'tab-1')
const replacement = registry.begin('node-1', 'tab-1')
assert.equal(first.signal.aborted, true)
assert.equal(replacement.signal.aborted, false)

const otherTab = registry.begin('node-1', 'tab-2')
registry.cancel('node-1', 'tab-1')
assert.equal(replacement.signal.aborted, true)
assert.equal(otherTab.signal.aborted, false)

const another = registry.begin('node-2', 'tab-2')
registry.cancelAll()
assert.equal(otherTab.signal.aborted, true)
assert.equal(another.signal.aborted, true)

const anonymous = registry.begin()
const finishedAnonymous = registry.begin()
registry.finish(undefined, undefined, finishedAnonymous)
registry.cancelAll()
assert.equal(anonymous.signal.aborted, true)
assert.equal(finishedAnonymous.signal.aborted, false)

console.log('canvasUploadCancellation tests passed')

import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoPreview.vue'), 'utf8')

assert.match(source, /const isDragging = ref\(false\)/, 'fine erase selection should track active drags')
assert.match(source, /const committedSelection = ref\(null\)/, 'fine erase selection should persist after drawing')
assert.match(source, /const dragPreviewRect = ref\(null\)/, 'fine erase should use a live preview rectangle while editing')
assert.match(source, /dragPreviewRect\.value \|\| committedSelection\.value/, 'fine erase selection should render the active preview or the committed rectangle')
assert.match(source, /function getContainedVideoBox/, 'fine erase should calculate the visible video content box inside letterbox bars')
assert.match(source, /if \(!isPrimaryPointer\(event\)\) return/, 'fine erase should only start from a primary left-button pointerdown')
assert.match(source, /if \(!isPointInsideBox\(point, videoBox\)\) return/, 'fine erase should ignore pointerdown in black letterbox areas')
assert.match(source, /startDrawSelection\(point, videoBox, event\)/, 'fine erase should start a new selection from the visible video content')
assert.match(source, /startMoveSelection\(point, videoBox, event\)/, 'fine erase should support moving a committed selection')
assert.match(source, /startResizeSelection\(point, videoBox, event, handle\)/, 'fine erase should support resizing a committed selection')
assert.match(source, /if \(!isDragging\.value \|\| !dragStart\.value \|\| props\.mode !== 'fine'\) return/, 'fine erase pointermove should not create a selection before pointerdown')
assert.match(source, /updateMoveSelection\(point, videoBox\)/, 'fine erase should update the committed selection while moving')
assert.match(source, /updateResizeSelection\(point, videoBox\)/, 'fine erase should update the committed selection while resizing')
assert.match(source, /commitSelection\(dragPreviewRect\.value, videoBox\)/, 'fine erase should persist and emit the edited rectangle on pointerup')
assert.match(source, /sourceWidth:\s*videoRef\.value\?\.videoWidth/, 'fine erase should include the source video width for providers that require pixel rectangles')
assert.match(source, /sourceHeight:\s*videoRef\.value\?\.videoHeight/, 'fine erase should include the source video height for providers that require pixel rectangles')
assert.match(source, /data-handle="nw"/, 'fine erase should render a northwest resize handle')
assert.match(source, /data-handle="ne"/, 'fine erase should render a northeast resize handle')
assert.match(source, /data-handle="sw"/, 'fine erase should render a southwest resize handle')
assert.match(source, /data-handle="se"/, 'fine erase should render a southeast resize handle')
assert.match(source, /@pointercancel="handlePointerCancel"/, 'fine erase pointercancel should clear without submitting a selection')
assert.match(source, /function handlePointerCancel\(event\)/, 'fine erase should handle canceled drags separately from pointerup')
assert.match(source, /clearDragState\(\)/, 'fine erase should clear transient selection after pointerup or cancel')

console.log('VideoPreview fine erase selection tests passed')

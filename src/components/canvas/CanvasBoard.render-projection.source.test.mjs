import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(
  source,
  /import\s*{\s*projectCanvasRenderState\s*}\s*from\s*['"]@\/utils\/canvasRenderProjection\.js['"]/,
  'CanvasBoard should import the pure render projection utility'
)

assert.match(
  source,
  /import\s+CanvasMiniMapOverview\s+from\s+['"]\.\/CanvasMiniMapOverview\.vue['"]/,
  'CanvasBoard should use a lightweight overview for high-count workflows'
)

assert.doesNotMatch(
  source,
  /v-model:nodes="canvasStore\.nodes"/,
  'CanvasBoard should not pass the full node store to Vue Flow in high-count canvases'
)

assert.doesNotMatch(
  source,
  /v-model:edges="canvasStore\.edges"/,
  'CanvasBoard should not pass the full edge store to Vue Flow in high-count canvases'
)

assert.match(
  source,
  /:nodes="renderedFlowNodes"/,
  'Vue Flow should receive the bounded projected node list'
)

assert.match(
  source,
  /:edges="renderedFlowEdges"/,
  'Vue Flow should receive the bounded projected edge list'
)

assert.match(
  source,
  /selectedIds:\s*projectionEnabled\s*\?\s*virtualizationSelectedIds\.value\s*:\s*EMPTY_RENDER_PROJECTION_IDS/,
  'normal-size workflows should not rebuild the Vue Flow node list for selection-only changes'
)

assert.match(
  source,
  /nodes:\s*\[\.\.\.projection\.nodes\]/,
  'normal-size workflows should refresh the node array when projected node data changes'
)

assert.match(
  source,
  /edges:\s*\[\.\.\.projection\.edges\]/,
  'normal-size workflows should refresh the edge array when projected edge data changes'
)

assert.match(
  source,
  /positionOverrides:\s*activeDragPositions/,
  'large-canvas projections should receive Vue Flow live drag positions'
)

assert.match(
  source,
  /onNodeDrag\(\(event\) => \{[\s\S]*?updateActiveDragPositions\(event\)/,
  'node drag events should refresh the transient projected positions'
)

assert.match(
  source,
  /onNodeDragStop\(\(event\) => \{[\s\S]*?clearActiveDragPositions\(\)/,
  'transient drag positions should be cleared after final positions reach the store'
)

assert.match(
  source,
  /function\s+getInitialCanvasBoardSize\(\)/,
  'CanvasBoard should have a first-render size fallback so large canvases never pass all nodes to Vue Flow'
)

assert.match(
  source,
  /const\s+canvasBoardSize\s*=\s*ref\(getInitialCanvasBoardSize\(\)\)/,
  'CanvasBoard should initialize render projection with a non-zero browser viewport fallback'
)

assert.match(
  source,
  /if\s*\(!width\s*\|\|\s*!height\)\s*return/,
  'CanvasBoard should not overwrite the first-render projection fallback with a zero-size transient rect'
)

assert.match(
  source,
  /<MiniMap[\s\S]*v-if="showCanvasMiniMap && !renderProjection\.enabled"/,
  'Vue Flow MiniMap should only render for normal-size workflows'
)

assert.match(
  source,
  /<CanvasMiniMapOverview[\s\S]*v-else-if="showCanvasMiniMap && renderProjection\.enabled"/,
  'High-count workflows should use the lightweight overview instead of Vue Flow MiniMap'
)

console.log('CanvasBoard render projection source tests passed')

# Canvas Image Node Edit Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist node-scoped image editing sessions, preserve export quality, and keep downstream image propagation limited to the node's single final image.

**Architecture:** Store editor-session metadata on each image node, backed by uploaded snapshot URLs instead of inline base64 history. Rework the native editor so interaction happens on a display canvas while history/export operate on a backing canvas at original resolution. Keep existing downstream propagation semantics untouched except for explicit regression coverage.

**Tech Stack:** Vue 3, Pinia, Vite, existing canvas store/utilities, native Canvas API, existing canvas media upload APIs, Node.js `node:test`

---

### Task 1: Cover node image/session behavior in store and edit-mode tests

**Files:**
- Create: `src/components/canvas/ImageEditMode.session.test.mjs`
- Modify: `src/stores/canvas/canvasStore.js`
- Test: `src/components/canvas/ImageEditMode.session.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useCanvasStore } from '@/stores/canvas'

test('updated image node still propagates only the final image url', () => {
  setActivePinia(createPinia())
  const store = useCanvasStore()

  store.addNode({
    id: 'image-1',
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      sourceImages: ['https://cdn/base.png'],
      output: { type: 'image', urls: ['https://cdn/final.png'] },
      editSession: {
        version: 1,
        historyIndex: 0,
        history: [{ snapshotUrl: 'https://cdn/snap-1.png', kind: 'full' }]
      }
    }
  })

  store.addNode({
    id: 'target-1',
    type: 'image-to-image',
    position: { x: 300, y: 0 },
    data: {}
  })

  store.addEdge({ source: 'image-1', target: 'target-1' })

  assert.deepEqual(store.nodes.find(n => n.id === 'target-1').data.inheritedData, {
    type: 'image',
    urls: ['https://cdn/final.png']
  })
})

test('image edit session persists on node data after save', () => {
  setActivePinia(createPinia())
  const store = useCanvasStore()

  store.addNode({
    id: 'image-2',
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      output: { type: 'image', urls: ['https://cdn/final-1.jpg'] }
    }
  })

  store.updateNodeData('image-2', {
    editSession: {
      version: 1,
      currentImageUrl: 'https://cdn/final-1.jpg',
      exportFormat: 'jpeg',
      historyIndex: 1,
      history: [
        { snapshotUrl: 'https://cdn/snap-a.jpg', kind: 'full' },
        { snapshotUrl: 'https://cdn/snap-b.jpg', kind: 'full' }
      ]
    }
  })

  const node = store.nodes.find(n => n.id === 'image-2')
  assert.equal(node.data.editSession.exportFormat, 'jpeg')
  assert.equal(node.data.editSession.historyIndex, 1)
  assert.equal(node.data.editSession.history.length, 2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/canvas/ImageEditMode.session.test.mjs`
Expected: FAIL because the new test file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// canvasStore.js
function propagateData(sourceId, targetId, targetHandle = null) {
  const sourceNode = nodes.value.find(n => n.id === sourceId)
  const targetNode = nodes.value.find(n => n.id === targetId)
  if (!sourceNode || !targetNode) return

  let inheritedData = null

  if (sourceNode.data.output) {
    inheritedData = sourceNode.data.output
  } else if ((sourceNode.type === 'image-input' || sourceNode.type === 'image') &&
             (sourceNode.data.sourceImages?.length || sourceNode.data.images?.length)) {
    inheritedData = {
      type: 'image',
      urls: sourceNode.data.sourceImages || sourceNode.data.images
    }
  }

  if (inheritedData) {
    updateNodeData(targetId, {
      inheritedFrom: sourceId,
      inheritedData,
      hasUpstream: true
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/canvas/ImageEditMode.session.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/ImageEditMode.session.test.mjs src/stores/canvas/canvasStore.js
git commit -m "test: cover canvas image edit session propagation"
```

### Task 2: Add edit-session serialization helpers and auto-save coverage

**Files:**
- Create: `src/components/canvas/imageEditSession.js`
- Create: `src/components/canvas/imageEditSession.test.mjs`
- Modify: `src/stores/canvas/workflowAutoSave.js`
- Test: `src/components/canvas/imageEditSession.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampSessionHistory,
  chooseEditorExportFormat
} from './imageEditSession.js'

test('chooseEditorExportFormat keeps jpeg and never emits webp', () => {
  assert.deepEqual(chooseEditorExportFormat('https://cdn/a.jpeg'), {
    mimeType: 'image/jpeg',
    format: 'jpeg',
    quality: 1
  })
  assert.deepEqual(chooseEditorExportFormat('https://cdn/a.webp'), {
    mimeType: 'image/png',
    format: 'png',
    quality: 1
  })
})

test('clampSessionHistory keeps the newest 10 snapshots', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    snapshotUrl: `https://cdn/${index}.png`,
    kind: 'full'
  }))

  const session = clampSessionHistory({
    history,
    historyIndex: 11
  }, 10)

  assert.equal(session.history.length, 10)
  assert.equal(session.history[0].snapshotUrl, 'https://cdn/2.png')
  assert.equal(session.historyIndex, 9)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/canvas/imageEditSession.test.mjs`
Expected: FAIL because `imageEditSession.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
export function chooseEditorExportFormat(imageUrl = '') {
  const lower = imageUrl.toLowerCase()
  if (lower.includes('.jpg') || lower.includes('.jpeg')) {
    return { mimeType: 'image/jpeg', format: 'jpeg', quality: 1 }
  }
  if (lower.includes('.png')) {
    return { mimeType: 'image/png', format: 'png', quality: 1 }
  }
  return { mimeType: 'image/png', format: 'png', quality: 1 }
}

export function clampSessionHistory(session, maxEntries = 10) {
  const history = Array.isArray(session.history) ? [...session.history] : []
  if (history.length <= maxEntries) return { ...session, history }

  const trimmed = history.slice(history.length - maxEntries)
  const removed = history.length - trimmed.length

  return {
    ...session,
    history: trimmed,
    historyIndex: Math.max(0, (session.historyIndex ?? trimmed.length - 1) - removed)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/canvas/imageEditSession.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/imageEditSession.js src/components/canvas/imageEditSession.test.mjs src/stores/canvas/workflowAutoSave.js
git commit -m "feat: add canvas image edit session helpers"
```

### Task 3: Add failing editor-session restore/save tests

**Files:**
- Modify: `src/components/canvas/NativeImageEditor.vue`
- Create: `src/components/canvas/NativeImageEditor.session.test.mjs`
- Test: `src/components/canvas/NativeImageEditor.session.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isRestorableEditSession,
  buildSavedSessionPayload
} from './imageEditSession.js'

test('isRestorableEditSession rejects invalid indices', () => {
  assert.equal(isRestorableEditSession(null), false)
  assert.equal(isRestorableEditSession({
    version: 1,
    historyIndex: 3,
    history: [{ snapshotUrl: 'https://cdn/0.png', kind: 'full' }]
  }), false)
})

test('buildSavedSessionPayload keeps editor state and current snapshot', () => {
  const payload = buildSavedSessionPayload({
    baseImageUrl: 'https://cdn/base.png',
    currentImageUrl: 'https://cdn/final.png',
    exportFormat: 'png',
    exportQuality: 1,
    imageMimeType: 'image/png',
    originalWidth: 1200,
    originalHeight: 800,
    historyIndex: 0,
    history: [{ snapshotUrl: 'https://cdn/snap.png', kind: 'full' }],
    filters: { brightness: 100 },
    rotation: 0,
    flipX: false,
    flipY: false,
    brushSize: 10,
    brushColor: '#FF0000',
    currentMode: 'crop'
  })

  assert.equal(payload.version, 1)
  assert.equal(payload.currentImageUrl, 'https://cdn/final.png')
  assert.equal(payload.history.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/canvas/NativeImageEditor.session.test.mjs`
Expected: FAIL because helper exports do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
export function isRestorableEditSession(session) {
  if (!session || session.version !== 1) return false
  if (!Array.isArray(session.history) || session.history.length === 0) return false
  return Number.isInteger(session.historyIndex) &&
    session.historyIndex >= 0 &&
    session.historyIndex < session.history.length
}

export function buildSavedSessionPayload(input) {
  return {
    version: 1,
    baseImageUrl: input.baseImageUrl,
    currentImageUrl: input.currentImageUrl,
    exportFormat: input.exportFormat,
    exportQuality: input.exportQuality,
    imageMimeType: input.imageMimeType,
    originalWidth: input.originalWidth,
    originalHeight: input.originalHeight,
    historyIndex: input.historyIndex,
    history: input.history,
    filters: input.filters,
    rotation: input.rotation,
    flipX: input.flipX,
    flipY: input.flipY,
    brushSize: input.brushSize,
    brushColor: input.brushColor,
    currentMode: input.currentMode,
    updatedAt: Date.now()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/canvas/NativeImageEditor.session.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/NativeImageEditor.session.test.mjs src/components/canvas/imageEditSession.js src/components/canvas/NativeImageEditor.vue
git commit -m "test: define canvas image editor session contract"
```

### Task 4: Rework the native editor to preserve original-resolution output

**Files:**
- Modify: `src/components/canvas/NativeImageEditor.vue`
- Modify: `src/components/canvas/ImageEditMode.vue`
- Modify: `src/components/canvas/imageEditSession.js`
- Test: `src/components/canvas/NativeImageEditor.session.test.mjs`

- [ ] **Step 1: Write the failing test for export format selection**

```js
test('chooseEditorExportFormat keeps png for png inputs', () => {
  assert.deepEqual(chooseEditorExportFormat('https://cdn/a.png'), {
    mimeType: 'image/png',
    format: 'png',
    quality: 1
  })
})
```

- [ ] **Step 2: Run test to verify it fails only if behavior regresses**

Run: `node --test src/components/canvas/imageEditSession.test.mjs`
Expected: PASS before refactor, serving as regression coverage.

- [ ] **Step 3: Implement the backing-canvas flow**

```js
// NativeImageEditor.vue
const backingCanvasRef = ref(null)
const backingCtx = ref(null)
const originalWidth = ref(0)
const originalHeight = ref(0)
const displayScale = computed(() => canvasWidth.value / originalWidth.value)

function mapDisplayToBacking({ x, y }) {
  return {
    x: x / displayScale.value,
    y: y / displayScale.value
  }
}

function exportEditedImage() {
  const { mimeType, quality } = chooseEditorExportFormat(props.imageUrl)
  return backingCanvasRef.value.toDataURL(mimeType, quality)
}
```

- [ ] **Step 4: Run focused tests**

Run: `node --test src/components/canvas/imageEditSession.test.mjs src/components/canvas/NativeImageEditor.session.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/NativeImageEditor.vue src/components/canvas/ImageEditMode.vue src/components/canvas/imageEditSession.js
git commit -m "feat: preserve canvas image edit quality"
```

### Task 5: Persist session state on node save and restore after reload

**Files:**
- Modify: `src/components/canvas/ImageEditMode.vue`
- Modify: `src/stores/canvas/workflowAutoSave.js`
- Modify: `src/components/canvas/imageEditSession.js`
- Test: `src/components/canvas/ImageEditMode.session.test.mjs`

- [ ] **Step 1: Write the failing restore test**

```js
test('serialized node edit session survives workflow auto-save cleanup', () => {
  const node = {
    id: 'image-3',
    type: 'image',
    data: {
      output: { type: 'image', urls: ['https://cdn/final.png'] },
      editSession: {
        version: 1,
        historyIndex: 0,
        history: [{ snapshotUrl: 'https://cdn/snap.png', kind: 'full' }]
      }
    }
  }

  const cleaned = cleanNodeForAutoSave(node)
  assert.equal(cleaned.data.editSession.history[0].snapshotUrl, 'https://cdn/snap.png')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/canvas/ImageEditMode.session.test.mjs`
Expected: FAIL until the auto-save cleaner keeps `editSession`.

- [ ] **Step 3: Implement session persistence**

```js
// ImageEditMode.vue
canvasStore.updateNodeData(node.id, {
  editSession: savedSession,
  output: {
    ...node.data.output,
    urls: [newUrl]
  }
})

// workflowAutoSave.js
if (cleanedNode.data.editSession?.history) {
  cleanedNode.data.editSession = {
    ...cleanedNode.data.editSession,
    history: cleanedNode.data.editSession.history.filter(item => typeof item.snapshotUrl === 'string' && !item.snapshotUrl.startsWith('blob:'))
  }
}
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `node --test src/components/canvas/ImageEditMode.session.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/ImageEditMode.vue src/stores/canvas/workflowAutoSave.js src/components/canvas/imageEditSession.js src/components/canvas/ImageEditMode.session.test.mjs
git commit -m "feat: persist canvas image edit sessions"
```

### Task 6: Verify the full regression surface

**Files:**
- Modify: `src/components/canvas/ImageEditMode.session.test.mjs`
- Modify: `src/components/canvas/NativeImageEditor.session.test.mjs`
- Test: `src/components/canvas/ImageEditMode.session.test.mjs`
- Test: `src/components/canvas/imageEditSession.test.mjs`
- Test: `src/components/canvas/NativeImageEditor.session.test.mjs`

- [ ] **Step 1: Add the final regression assertions**

```js
test('chooseEditorExportFormat converts webp inputs to png', () => {
  assert.equal(chooseEditorExportFormat('https://cdn/demo.webp').format, 'png')
})

test('isRestorableEditSession accepts a valid session', () => {
  assert.equal(isRestorableEditSession({
    version: 1,
    historyIndex: 0,
    history: [{ snapshotUrl: 'https://cdn/snap.png', kind: 'full' }]
  }), true)
})
```

- [ ] **Step 2: Run the focused test suite**

Run: `node --test src/components/canvas/ImageEditMode.session.test.mjs src/components/canvas/imageEditSession.test.mjs src/components/canvas/NativeImageEditor.session.test.mjs`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: Vite build completes successfully.

- [ ] **Step 4: Inspect modified files**

Run: `git status --short`
Expected: Only intended files are modified, plus any pre-existing unrelated user changes remain untouched.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/ImageEditMode.session.test.mjs src/components/canvas/imageEditSession.test.mjs src/components/canvas/NativeImageEditor.session.test.mjs src/components/canvas/NativeImageEditor.vue src/components/canvas/ImageEditMode.vue src/stores/canvas/workflowAutoSave.js
git commit -m "feat: improve canvas image edit persistence"
```

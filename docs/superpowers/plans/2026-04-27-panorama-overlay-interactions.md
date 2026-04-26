# Panorama Overlay Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the panorama overlay editor with richer presets, reliable drag-sort layer ordering, inline rename, and drag resizing.

**Architecture:** Put deterministic overlay stack operations and preset generation in `src/utils/canvasPanoramaOverlay.js` with Node tests. Keep browser interaction state in `PanoramaPreviewModal.vue`, using one overlay drag mode for move and one for resize. Treat `overlays` array order as bottom-to-top and normalize z-index from that order.

**Tech Stack:** Vue 3 Composition API, browser pointer events, SVG data URL presets, existing Node `.test.mjs` utility tests, Vite build.

---

### Task 1: Helper Tests And Stack Utilities

**Files:**
- Modify: `src/utils/canvasPanoramaOverlay.test.mjs`
- Modify: `src/utils/canvasPanoramaOverlay.js`

- [ ] **Step 1: Add failing tests**

Append tests for `normalizeOverlayStack`, `moveOverlayInStack`, and `createPanoramaOverlayPresets`.

- [ ] **Step 2: Verify red**

Run `node src/utils/canvasPanoramaOverlay.test.mjs`. Expected failure: missing exports.

- [ ] **Step 3: Implement helpers**

Add:

- `normalizeOverlayStack(overlays)`
- `moveOverlayInStack(overlays, id, directionOrTargetIndex)`
- `createPanoramaOverlayPresets()`

- [ ] **Step 4: Verify green**

Run `node src/utils/canvasPanoramaOverlay.test.mjs`. Expected pass.

### Task 2: Modal Presets And Panel Placement

**Files:**
- Modify: `src/components/canvas/PanoramaPreviewModal.vue`

- [ ] **Step 1: Import helper presets and stack helpers**

Use `createPanoramaOverlayPresets`, `moveOverlayInStack`, and `normalizeOverlayStack`.

- [ ] **Step 2: Move top-bar overlay actions into inspector**

Remove `添加图片`, `标签`, and `清空贴片` from `.panorama-controls`; add them to `贴片管理` header/actions.

- [ ] **Step 3: Split preset picker tabs**

Use `人物假人`, `物品`, `本地上传`, `资产库`, `历史图片`.

### Task 3: Layer Reorder And Drag Sorting

**Files:**
- Modify: `src/components/canvas/PanoramaPreviewModal.vue`

- [ ] **Step 1: Make move buttons reorder array**

Replace z-index increment logic with `moveOverlayInStack`.

- [ ] **Step 2: Add drag row handlers**

Add row `draggable`, `dragstart`, `dragover`, `drop`, and `dragend` handlers.

- [ ] **Step 3: Normalize after add/delete/reorder**

Ensure all mutations leave `zIndex` as `index + 1`.

### Task 4: Inline Rename And Resize Handle

**Files:**
- Modify: `src/components/canvas/PanoramaPreviewModal.vue`

- [ ] **Step 1: Add inline rename state**

Add editing overlay ID and draft label state. Double-click label starts editing; blur/Enter/Escape commits.

- [ ] **Step 2: Add resize drag mode**

Add resize handle to selected overlay. Pointer drag changes `scale`, clamped between `0.2` and `3`.

- [ ] **Step 3: Preserve existing move drag**

Keep dragging the overlay body as position move, and stop propagation from label input and resize handle.

### Task 5: Verification And Commit

**Files:**
- Modify: `src/utils/canvasPanoramaOverlay.js`
- Modify: `src/utils/canvasPanoramaOverlay.test.mjs`
- Modify: `src/components/canvas/PanoramaPreviewModal.vue`

- [ ] **Step 1: Run focused tests**

Run:

```bash
node src/utils/canvasPanoramaOverlay.test.mjs
node src/utils/canvasPanoramaExport.test.mjs
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

- [ ] **Step 3: Commit**

Commit changed files with `feat: refine panorama overlay interactions`.

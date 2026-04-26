# Panorama VR Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a widescreen panorama VR preview tool for canvas image nodes, with current-view and geometric multi-view exports back into image and storyboard nodes.

**Architecture:** Add a small pure utility module for ratio definitions and preset views, a focused Three.js modal for the VR preview/capture UI, and integrate it into `ImageNode.vue` using existing canvas store, blob-first display, async upload, and storyboard patterns. The first version uses real sphere-based VR viewing and projection presets as camera/FOV approximations.

**Tech Stack:** Vue 3 SFC, Three.js, Pinia canvas store, existing canvas upload APIs, Node built-in assertions for utility tests, Vite build verification.

---

### Task 1: Panorama Utility Module

**Files:**
- Create: `src/utils/canvasPanoramaExport.js`
- Create: `src/utils/canvasPanoramaExport.test.mjs`

- [ ] **Step 1: Write failing utility tests**

Create `src/utils/canvasPanoramaExport.test.mjs` with Node `assert` tests covering widescreen detection, ratio lookup, 4-view presets, and 12-view presets.

- [ ] **Step 2: Run utility tests to verify failure**

Run: `cd bananaapiboard && node src/utils/canvasPanoramaExport.test.mjs`

Expected: FAIL with module-not-found or missing export error.

- [ ] **Step 3: Implement utility module**

Create `src/utils/canvasPanoramaExport.js` exporting:

- `PANORAMA_RATIO_OPTIONS`
- `PROJECTION_OPTIONS`
- `isPanorama21x9(width, height, tolerance = 0.08)`
- `isPanoramaVrSupportedRatio(width, height, tolerance = 0.08)`
- `getPanoramaRatioOption(id)`
- `getPresetPanoramaViews(count)`
- `getProjectionCameraSettings(projectionId)`

- [ ] **Step 4: Run utility tests to verify pass**

Run: `cd bananaapiboard && node src/utils/canvasPanoramaExport.test.mjs`

Expected: PASS.

### Task 2: Three.js Preview Modal

**Files:**
- Create: `src/components/canvas/PanoramaPreviewModal.vue`

- [ ] **Step 1: Implement modal component**

Create a full-screen Vue modal that loads an image texture, maps it to an inverted sphere, auto-rotates the camera target, supports drag and wheel interaction, renders a centered output frame overlay, and emits export payloads.

- [ ] **Step 2: Add capture support**

Use a dedicated offscreen `THREE.WebGLRenderer` to render selected yaw/pitch/FOV views into blobs at the selected output dimensions.

- [ ] **Step 3: Add extraction actions**

Implement `提取当前视角`, `4张图片`, `4宫格`, and `12宫格` actions. Emit payloads compatible with the design doc.

### Task 3: Image Node Integration

**Files:**
- Modify: `src/components/canvas/nodes/ImageNode.vue`

- [ ] **Step 1: Import utilities and modal**

Import `PanoramaPreviewModal`, `isPanoramaVrSupportedRatio`, and related constants.

- [ ] **Step 2: Detect widescreen images**

Load natural image dimensions for `currentImageUrl`, update local panorama detection state, and hide the button until dimensions are known.

- [ ] **Step 3: Add toolbar button and modal**

Add a `全景VR` button near `宫格裁剪`/`角度`, visible only when the image is `16:9` or wider. Mount `PanoramaPreviewModal` with current image URL.

- [ ] **Step 4: Handle exported frames**

For current-view and image-list exports, create image nodes to the right of the source node. For storyboard exports, create a `storyboard` node with `2x2` or `3x4` grid size and blob URLs. `3x4` means 3 rows and 4 columns in `StoryboardNode`. Upload each blob in the background and replace blob URLs with returned cloud URLs.

### Task 4: Build Verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Run utility tests**

Run: `cd bananaapiboard && node src/utils/canvasPanoramaExport.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `cd bananaapiboard && npm run build`

Expected: exit code 0.

- [ ] **Step 3: Inspect git diff**

Run: `git -C bananaapiboard diff --stat` and `git -C bananaapiboard status --short`

Expected: only planned source, test, and plan/doc changes plus pre-existing `.superpowers/`.

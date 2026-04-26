# Panorama VR 2D Overlay Design

## Goal

Extend the existing canvas `全景VR预览` modal so users can place local, asset-library, history, and preset transparent images over the stopped VR camera view, edit labels such as `人物1` and `物品1`, and export the current view as a single rendered image containing both the panorama background and the placed 2D elements.

This is the second stage of the panorama VR workflow. It builds on the existing `PanoramaPreviewModal.vue` and keeps the overlay editor local to the modal.

## Scope

First version:

- Add a 2D overlay editing layer inside the panorama preview modal.
- Support adding image overlays from:
  - Local image upload.
  - Canvas asset library images.
  - Canvas image history.
- Built-in preset mannequin silhouette assets.
- Preserve transparent PNG and WebP alpha when overlaying and exporting.
- Let users select, drag, scale, horizontally flip, rename, hide, and delete overlay items.
- Show editable labels above overlay items, for example `人物1`, `物品1`, `人物2`, `物品2`.
- Export `提取当前视角` as one PNG containing the current panorama view plus visible overlays and labels.
- Keep existing `4张图片`, `4宫格`, and `12宫格` panorama exports working as pure geometric panorama outputs.

Out of first-version scope:

- True 3D object placement, depth, occlusion, ground snapping, shadows, and perspective-aware scaling.
- AI-based matting, segmentation, or automatic scene understanding.
- Applying one overlay layout across multiple yaw/pitch preset exports.
- Persisting overlay editing state into the main workflow save format.

## Existing Context

Relevant frontend files:

- `src/components/canvas/PanoramaPreviewModal.vue`
  - Owns the Three.js panorama renderer, camera controls, ratio selection, and export actions.
- `src/components/canvas/nodes/ImageNode.vue`
  - Opens the panorama modal and handles export payloads by creating image or storyboard nodes.
- `src/utils/canvasPanoramaExport.js`
  - Contains ratio options, projection options, supported-ratio detection, and preset view generation.
- `src/components/canvas/AssetPanel.vue`
  - Existing canvas asset UI. The overlay flow should reuse the same asset API rather than embedding the full panel if that keeps the modal simpler.
- `src/components/canvas/HistoryPanel.vue`
  - Existing history UI. The overlay flow should reuse the same history API for image selection.
- `src/api/canvas/assets.js`
  - Provides `getAssets`.
- `src/api/canvas/history.js`
  - Provides `getHistory`.

The repository already contains uncommitted panorama VR preview work. This overlay feature should be implemented as a narrow extension and must not rewrite unrelated canvas behavior.

## User Flow

1. User selects a panorama-capable image node in canvas mode.
2. User opens `全景VR`.
3. The panorama modal opens and behaves as it does today.
4. User rotates or zooms the camera, then stops at the desired view.
5. User opens the overlay source menu and chooses one of:
   - `本地上传`
   - `资产库`
   - `历史图片`
   - `预设假人`
6. The chosen image appears centered inside the current preview frame.
7. User drags the image to place it, scales it, flips it, and edits its label.
8. User repeats this for more people or objects.
9. User clicks `提取当前视角`.
10. The exported canvas image node contains the current panorama background, all visible overlay images, and their visible labels.

## UI Design

The modal remains full-screen and dark. Add a right-side inspector panel and lightweight top-bar controls.

Top bar additions:

- `添加图片` split button or menu.
- `显示标签` toggle.
- `清空贴片` action with confirmation if overlays exist.

Right inspector panel:

- Empty state: `暂无贴片`
- List of overlay items with thumbnail, label, visibility toggle, and delete button.
- Selected item controls:
  - Name input.
  - Type selector: `人物` or `物品`, used only for default naming.
  - Scale slider.
  - Flip horizontal toggle.
  - Bring forward / send backward controls if multiple overlays overlap.

Overlay canvas behavior:

- The overlay layer is positioned over the same preview frame used for export framing.
- Each item is an absolutely positioned element with stable coordinates in normalized frame space.
- Selected item shows a thin selection outline and resize handle.
- Dragging an item does not rotate the panorama.
- Dragging outside overlays keeps the existing panorama drag behavior.
- Labels appear above each item in a small dark badge similar to the reference screenshot.
- Label text is editable through the inspector, not direct inline editing in the first version.

Source pickers:

- Local upload opens an `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif">`.
- Asset picker loads image assets with `getAssets({ type: 'image' })`.
- History picker loads image history with `getHistory({ type: 'image' })`.
- Preset mannequin picker shows a small built-in set of transparent PNG or SVG-derived silhouette assets shipped with the frontend.

## Data Model

Overlay state remains local to `PanoramaPreviewModal.vue`.

```js
{
  id: 'overlay-...',
  source: 'local' | 'asset' | 'history' | 'preset',
  type: 'person' | 'object',
  label: '人物1',
  url: 'blob:...' | 'https://...',
  originalName: '...',
  x: 0.5,
  y: 0.62,
  scale: 1,
  flipped: false,
  visible: true,
  zIndex: 1,
  naturalWidth: 512,
  naturalHeight: 1024
}
```

Coordinate rules:

- `x` and `y` are normalized to the output preview frame, from `0` to `1`.
- `scale` is relative to a modal-defined base display size.
- Export uses the same normalized coordinates against the selected output resolution.
- The data is not persisted in the workflow in version one.

Default naming:

- New person overlays use `人物1`, `人物2`, and so on.
- New object overlays use `物品1`, `物品2`, and so on.
- Preset mannequins default to `人物N`.
- Asset and history images can infer object/person type from the active source picker tab or user selection.

## Export Behavior

`提取当前视角` uses a two-step render:

1. Render the current panorama camera view into an offscreen canvas at the selected ratio and output dimensions.
2. Draw visible overlay images and labels on top of that canvas.

Important details:

- Use `drawImage` with `ctx.save()`, `ctx.translate()`, `ctx.scale(-1, 1)`, and `ctx.restore()` for flipped overlays.
- Use `image.crossOrigin = 'anonymous'` for remote image overlays.
- Use the existing `loadImageUrl` proxy-safe image-loading path where possible.
- If one overlay fails to load during export, block export and show `贴片图片加载失败，请重试`.
- Exported blob remains a PNG so transparent overlay edges and labels render cleanly.
- Existing `handlePanoramaExport` in `ImageNode.vue` does not need to understand overlay metadata because the modal emits the final composited blob.

`4张图片`, `4宫格`, and `12宫格` stay unchanged:

- They export geometric panorama views only.
- They do not include 2D overlays in first version.
- This avoids implying that a screen-space overlay has stable 3D position across different camera angles.

## Components And Utilities

### `PanoramaPreviewModal.vue`

Add responsibilities:

- Manage overlay state.
- Load source picker data for asset and history images.
- Handle local file blob URLs and revoke them on modal cleanup.
- Render overlay items over the preview frame.
- Capture composited current view.
- Keep pointer events separated between panorama dragging and overlay dragging.

### Optional `PanoramaOverlayPicker.vue`

Create this only if the modal becomes too large.

Responsibilities:

- Show source tabs: local, assets, history, presets.
- Fetch and display selectable image grids.
- Emit a normalized selected image payload.

### Optional `canvasPanoramaOverlay.js`

Create this only if pure logic needs focused tests.

Candidate helpers:

- `createDefaultOverlay`.
- `getNextOverlayLabel`.
- `normalizeOverlayForExport`.
- `drawOverlayToCanvas`.

## Error Handling

- Local file is not an image: show `请选择图片文件`.
- Local file is too large for browser rendering: show `图片过大，请压缩后重试`.
- Asset or history load fails: show `图片加载失败，请重试`.
- Remote overlay cannot be drawn because of CORS tainting: retry through the existing proxy-safe loader; if it still fails, show `贴片图片加载失败，请重试`.
- Export fails: show `当前画面合成失败，请重试`.
- If all overlays are hidden, current-view export should still work as the existing panorama export.

## Performance

- Keep overlay images as URLs and HTML images during editing; avoid storing base64 strings.
- Revoke local blob URLs on item deletion and modal close.
- Load asset and history lists lazily when their source tabs are opened.
- Limit picker lists to the first page or existing API default in version one.
- Do not run continuous canvas compositing during editing; compose only on export.

## Accessibility And Mobile

- Buttons have clear titles.
- Inspector controls are reachable by keyboard.
- Escape closes the modal as it does today.
- Mobile is supported at a basic level: overlay dragging should work with pointer events, but detailed multi-touch scaling is out of scope for first version.

## Testing

Automated tests:

- If `canvasPanoramaOverlay.js` is created, add narrow tests for:
  - Default label generation.
  - Normalized coordinate conversion.
  - Overlay draw transform for flipped items.

Manual verification:

- `npm run build` succeeds in `bananaapiboard`.
- A panorama node still opens `全景VR`.
- Existing panorama drag, wheel zoom, projection selection, and ratio selection still work.
- Local PNG with transparency can be added and moved.
- Local WebP/JPEG can be added and moved.
- Asset-library image can be added and moved.
- History image can be added and moved.
- Preset mannequin can be added and moved.
- Selected overlay can be scaled, flipped, renamed, hidden, deleted, and reordered.
- Labels render above overlays in the modal.
- `提取当前视角` creates one canvas image node containing background, overlays, and labels.
- `4张图片`, `4宫格`, and `12宫格` still create pure panorama outputs.
- Closing the modal revokes local blob URLs and does not leave pointer handlers or animation frames active.

## Acceptance Criteria

- Users can add 2D people or object images from local files, asset library, history images, and preset mannequins in the panorama VR modal.
- Transparent images remain visually transparent in the preview and exported result.
- Users can place overlays precisely in the current view through drag and scale controls.
- Users can horizontally flip overlays.
- Users can edit labels such as `人物1` and `物品1`.
- Current-view export is visually WYSIWYG for the selected panorama frame, overlays, and labels.
- Existing panorama export modes continue to work.
- The feature is scoped to the modal and does not alter saved workflow data in version one.

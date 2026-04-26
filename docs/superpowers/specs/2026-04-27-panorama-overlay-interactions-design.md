# Panorama Overlay Interactions Design

## Goal

Refine the panorama VR 2D overlay editor so the overlay controls live in the `贴片管理` panel, preset assets are rich enough for real use, layer ordering is reliable and drag-sortable, and overlays can be renamed and resized directly on the preview canvas.

## Changes

- Move the `添加图片` action from the modal top bar into the `贴片管理` panel header.
- Keep `标签` and `清空贴片` near the overlay management controls instead of the panorama controls.
- Expand presets:
  - 8 `人物假人` options with different silhouettes and colors.
  - 10 `物品` options with different object shapes and colors.
- Split the preset picker into `人物假人` and `物品` tabs, alongside `本地上传`, `资产库`, and `历史图片`.
- Fix layer ordering by making the overlay array order the source of truth and normalizing `zIndex` after every order change.
- Support drag sorting in the `贴片管理` list. Dragging a row above or below another row changes the visual layer order.
- Keep simple `上移` and `下移` controls as a fallback, but make them reorder the array rather than incrementing duplicate `zIndex` values.
- Support double-click rename on a preview overlay label. The label becomes an inline input and commits on Enter, blur, or Escape.
- Support direct canvas resizing through a resize handle on the selected overlay. Dragging the handle updates the overlay `scale`.

## Root Cause For Layer Bug

The current implementation changes only `zIndex` by adding or subtracting 1. This can create duplicate z-index values, and the management list still renders in original array order. The visual result can look unchanged, especially when adjacent overlays share the same z-index. The fix is to reorder the overlay array itself and recompute z-index values from that order.

## Data Rules

- `overlays` array order is bottom-to-top.
- `zIndex` is normalized to `index + 1`.
- The preview renders overlays through `sortVisibleOverlays`, so normalized z-index and array order stay aligned.
- Drag sorting and button sorting use the same `moveOverlayInStack` helper.
- Export uses the same normalized overlay order.

## Acceptance Criteria

- `添加图片` appears inside `贴片管理`, not in the panorama top control group.
- The preset picker offers 8 person silhouettes and 10 object presets.
- `上移` and `下移` visibly change overlay stacking.
- Dragging rows in `贴片管理` changes stacking order.
- Double-clicking a visible overlay label lets the user edit the name in place.
- Dragging the selected overlay resize handle changes the overlay size.
- Existing local upload, asset image, history image, flip, hide, delete, and export behavior still work.

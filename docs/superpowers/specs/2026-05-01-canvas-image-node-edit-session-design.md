# Canvas Image Node Edit Session Design

## Goal

Refine the canvas image-node editor so saving an edit replaces the node's current image, preserves image quality without exporting WebP, restores the same node's previous edit session after page refresh or workflow reload, and still sends only the node's single final image to downstream nodes.

## Confirmed Decisions

- Edit-session persistence is scoped to a node, not shared across nodes that happen to reference the same image.
- JPEG inputs must stay JPEG on export, using the highest practical quality.
- WebP must never be emitted from the editor save path.
- PNG inputs should stay PNG.
- Downstream propagation should continue to see only the node's single current image, not edit history, masks, or session metadata.

## Current State

`ImageEditMode.vue` already tries to overwrite the node image and restore cached state, but the cache is an in-memory `Map` that disappears on refresh. It also clears the cache after a successful save, which breaks "continue editing later". `NativeImageEditor.vue` stores history as display-sized PNG data URLs, so saved results are limited by the visible editor canvas instead of the original image resolution.

## Problems To Solve

1. Saving an edit should replace the node's current image in-place without creating a new node.
2. Reopening the same node after save, reload, or workflow restore should reopen the prior edit session.
3. Final export should not degrade resolution and should avoid low-quality recompression.
4. Downstream nodes should continue to consume only the current final image URL.
5. Workflow save and local auto-save should not be overwhelmed by raw base64 history payloads.

## Design Overview

Split the concept of "final node image" from "editor session". The node keeps exposing one current image URL through `output.urls[0]` or `sourceImages[0]`. Separately, the node stores an `editSession` object that tracks the editor's current state and snapshot history. Snapshot images are persisted as uploaded media URLs instead of large inline base64 payloads.

The editor itself moves to a dual-canvas model:

- A display canvas sized for the modal viewport and user interaction.
- A backing canvas sized to the original image pixels.

All mutations are applied against the backing canvas. Display coordinates are mapped into backing-canvas coordinates for drawing, crop boxes, annotations, filters, and masks. History snapshots are created from the backing canvas so restore/export keep original resolution.

## Data Model

Add `data.editSession` to image nodes:

```js
{
  version: 1,
  baseImageUrl: 'https://...',
  currentImageUrl: 'https://...',
  exportFormat: 'png' | 'jpeg',
  exportQuality: 1,
  imageMimeType: 'image/png' | 'image/jpeg',
  originalWidth: 2048,
  originalHeight: 1365,
  displayScale: 0.5,
  historyIndex: 3,
  history: [
    { snapshotUrl: 'https://...', kind: 'full' },
    { snapshotUrl: 'https://...', kind: 'full' }
  ],
  filters: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    grayscale: 0,
    invert: 0,
    sepia: 0
  },
  rotation: 0,
  flipX: false,
  flipY: false,
  brushSize: 10,
  brushColor: '#FF0000',
  currentMode: 'crop',
  updatedAt: 1770000000000
}
```

## Save Rules

When the user clicks save:

1. Export the backing canvas using the node session's chosen format.
2. Upload the final image.
3. Overwrite the node's first visible image:
   - `output.urls[0]` when present
   - otherwise `output.url`
   - otherwise `sourceImages[0]`
   - otherwise create `output.urls = [newUrl]`
4. Persist `editSession` instead of clearing it.
5. If a mask exists, keep the current mask upload flow and related mask node behavior.

Export format selection:

- Input `.jpg` or `.jpeg`: export `image/jpeg` with quality `1`.
- Input `.png`: export `image/png`.
- Input `.webp` or unknown format: export `image/png`.

## Restore Rules

On editor open:

1. Load the node.
2. If `editSession` exists and passes validation, restore it.
3. Validation requires:
   - supported `version`
   - non-empty `history`
   - valid `historyIndex`
   - currently referenced snapshot URL loads successfully
4. On restore failure, clear the broken session and start a fresh session from the node's current image.

Successful restore should recover:

- history stack and index
- transform state
- filter state
- tool settings
- current mode

## History Limits

Session history must be capped to avoid runaway storage. Keep the most recent 10 snapshots. When a new snapshot exceeds the limit, delete the oldest entry from the session array and shift the history index accordingly. This cap applies only to editor-session history, not normal node output history.

## Workflow Persistence

The editor session is stored inside node data so it survives:

- auto-save to local storage
- manual workflow save
- workflow reload into a new tab

Because snapshot content is stored as uploaded URLs, auto-save only serializes lightweight metadata and URLs, not multi-megabyte base64 payloads.

## Downstream Behavior

`propagateData()` and downstream image collection logic remain intentionally simple:

- Prefer `output.urls`
- Fall back to `output.url`
- Fall back to `sourceImages`

`editSession` is not part of propagated data and must never be treated as a reference-image source.

## Error Handling

- Final image upload fails: keep the editor open, preserve the in-memory session, and let the user retry.
- Final image upload succeeds but session persistence fails: update the node image, surface a warning, and fall back to reopening from the current final image next time.
- Session snapshot URL fails to load during restore: discard the broken session and reopen from the current node image.

## Testing Scope

- Save replaces the current node image instead of creating a new node.
- Reopen the same node after save restores prior history state.
- Refresh and restore workflow keep the same node session available.
- Downstream image consumers still receive only one final image URL.
- PNG input stays PNG.
- JPEG input stays JPEG and never exports WebP.
- Invalid session metadata falls back to a fresh edit session without breaking node display.

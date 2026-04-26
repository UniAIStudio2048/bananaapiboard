# Panorama VR Preview Design

## Goal

Add a canvas image-node tool for widescreen panorama-style images. The tool opens a full-screen VR-style preview, lets the user rotate the view, and exports the current or preset views back into the canvas as image nodes or storyboard grids.

The GitHub project referenced by the user is an interaction reference only. The implementation target is the existing `bananaapiboard` canvas.

## Scope

First version:

- Show a `全景VR` button only for image nodes whose loaded image ratio is `16:9` or wider.
- Open a full-screen panorama preview modal from the image node toolbar.
- Map the source panorama onto the inside of a Three.js sphere.
- Auto-rotate the view slowly after opening.
- Allow mouse drag to rotate horizontally and vertically, and mouse wheel to adjust field of view.
- Export the current camera view to the canvas using the selected output ratio.
- Extract preset scene views geometrically, without AI analysis.
- Output preset scene views as separate image nodes, a 4-cell storyboard, or a 12-cell storyboard.

Out of first-version scope:

- AI semantic scene selection.
- Server-side panorama processing.
- Perfect mathematical implementations of Pannini and little-planet projection.
- Mobile gesture polish beyond basic pointer/touch compatibility.

## User Flow

1. User selects an image node.
2. The node toolbar detects the image dimensions.
3. If the image is `16:9` or wider, the toolbar shows `全景VR`.
4. User clicks `全景VR`.
5. A full-screen preview opens with the panorama rendered as an immersive sphere.
6. The view starts slow auto-rotation.
7. User drags to aim the camera and scrolls to zoom.
8. User selects projection, output ratio, and extraction mode.
9. User clicks one of:
   - `提取当前视角`
   - `4张图片`
   - `4宫格`
   - `12宫格`
10. Generated images appear immediately on the canvas using blob URLs, then upload in the background and update to cloud URLs.

## UI

The image-node toolbar gets one new button:

- Label: `全景VR`
- Visibility: only when a usable image exists and its natural ratio is `16:9` or wider.
- Placement: near existing image tools such as `角度` and `宫格裁剪`.

The preview modal uses a dark full-screen layout:

- Top bar:
  - Title: `全景VR预览`
  - Projection select: `直线投影`, `Pannini`, `立体投影`, `小行星`
  - Ratio select:
    - `16:9 (1920x1080)`
    - `9:16 (1080x1920)`
    - `3:2 (1920x1280)`
    - `2:3 (1080x1620)`
    - `4:3 (1920x1440)`
    - `3:4 (1080x1440)`
    - `1:1 (1440x1440)`
    - `21:9 (2520x1080)`
    - `32:9 (3840x1080)`
  - `提取当前视角`
  - Extraction menu:
    - `4张图片`
    - `4宫格`
    - `12宫格`
  - Close button
- Main area:
  - Full-screen Three.js canvas.
  - Center preview frame showing the selected output ratio.
- Bottom bar:
  - Rendered output dimensions.
  - Current FOV.
  - Projection name.
  - Short interaction hint.

Projection behavior in the first version:

- `直线投影`: default perspective camera rendering.
- `立体投影`: wider FOV preset and stronger perspective feel.
- `Pannini`: UI option with a tuned FOV/aspect framing approximation.
- `小行星`: UI option with a high pitch and wide-FOV approximation.

The options are intentionally present in the first version so the workflow is complete. More accurate shader-based projections can replace the approximations later without changing the modal contract.

## Components

### `ImageNode.vue`

Responsibilities:

- Detect whether the current node image is a panorama candidate.
- Show the `全景VR` toolbar button only for panorama candidates.
- Open `PanoramaPreviewModal`.
- Pass the current image URL and source node metadata into the modal.
- Receive exported blobs from the modal and create canvas nodes or storyboards.

The node already contains robust helpers for image loading, blob-first display, async upload, and storyboard creation. The implementation should reuse or extract these helpers instead of introducing a separate upload path.

### `PanoramaPreviewModal.vue`

Responsibilities:

- Load the panorama image through the same proxy-safe image loading path used by canvas crop operations.
- Create and own a Three.js renderer, scene, camera, sphere mesh, and texture.
- Render inside a full-screen modal.
- Handle pointer drag, wheel zoom, auto-rotation, resize, and cleanup.
- Capture the selected frame by rendering to an offscreen canvas or renderer target.
- Generate preset geometric views for 4 or 12 scene extraction.
- Emit structured export events to `ImageNode.vue`.

### Optional Utility Module

If helper duplication becomes noticeable, create `src/utils/canvasPanoramaExport.js` or similar for:

- Ratio definitions.
- Widescreen ratio detection.
- Preset yaw/pitch generation.
- Blob creation from rendered frames.
- Common output metadata.

Keep this module narrow. It should not own canvas-store mutations.

## Data Flow

Inputs:

- `imageUrl`: selected image-node source or output URL.
- `sourceNodeId`: current image-node ID.
- `sourceNodePosition`: current node position.
- `sourceNodeWidth`: current node width when available.

Export payload:

```js
{
  mode: 'current-view' | 'images' | 'storyboard',
  ratio: '16:9',
  projection: 'rectilinear',
  width: 1920,
  height: 1080,
  frames: [
    {
      blob,
      yaw,
      pitch,
      fov,
      label
    }
  ],
  storyboardGridSize: '2x2' | '3x4'
}
```

Canvas mutation:

- `current-view`: create one `image` node to the right of the source node.
- `images`: create one `image` node per frame in a tidy grid to the right of the source node.
- `storyboard`: create one `storyboard` node with `images` filled by blob URLs, then replace them as uploads finish. `12宫格` uses `3x4`, which renders as 3 rows and 4 columns.

Background upload:

- Blob URLs are used immediately for fast visual feedback.
- Each blob is uploaded as an image file.
- When an upload resolves, the corresponding image node or storyboard cell is updated to the returned cloud URL.
- Blob URLs are revoked after the reactive update is applied.

## Supported Ratio Detection

Detection should use natural image dimensions, not node display dimensions.

Suggested tolerance:

```js
const ratio = naturalWidth / naturalHeight
const isPanorama = ratio >= 16 / 9 - 0.08
```

If dimensions are unavailable, the button remains hidden until the image loads.

## Preset Scene Extraction

The first version uses fixed geometric views:

- 4 views:
  - front: yaw `0`
  - right: yaw `90`
  - back: yaw `180`
  - left: yaw `270`
- 12 views:
  - 8 horizontal yaw positions every `45` degrees at pitch `0`
  - 2 upward views at yaw `45` and `225`, pitch `35`
  - 2 downward views at yaw `135` and `315`, pitch `-35`

Labels should be Chinese and clear, for example `全景-前`, `全景-右`, `全景-上-1`.

## Error Handling

- If image loading fails, show a canvas dialog/toast: `全景图片加载失败，请重试`.
- If the browser cannot create a WebGL renderer, show: `当前浏览器不支持全景预览`.
- If capture fails, show: `视角提取失败，请重试`.
- If upload fails, keep the blob preview visible and mark the node or storyboard as upload failed using existing canvas conventions where available.
- The modal must clean up renderer resources, textures, event listeners, animation frames, and blob URLs it owns.

## Performance

- Use Three.js only while the modal is open.
- Dispose geometry, material, texture, and renderer on close.
- Pause auto-rotation during active pointer drag.
- Limit export work to one frame at a time to avoid freezing the UI.
- Use `requestAnimationFrame` between multiple frame exports.
- Avoid storing large base64 strings in node data.

## Testing

Manual verification:

- Build succeeds with `npm run build`.
- A normal 4:3 or 1:1 image node does not show `全景VR`.
- A 16:9 image node shows `全景VR`.
- A 2:1, 21:9, or 32:9 image node shows `全景VR`.
- The modal opens and auto-rotates.
- Dragging changes yaw and pitch.
- Wheel changes FOV within bounds.
- `提取当前视角` creates one image node with the selected ratio.
- `4张图片` creates four image nodes.
- `4宫格` creates a `2x2` storyboard with four images.
- `12宫格` creates a storyboard with twelve images.
- Generated blobs are replaced by uploaded URLs when upload succeeds.
- Closing the modal releases WebGL resources and does not leave animation running.

Automated tests are optional for this first version because the repo has no unified test runner. If helper functions are extracted, add narrow tests for ratio detection and preset view generation if a local test pattern exists.

## Acceptance Criteria

- The feature is available on image nodes whose natural ratio is `16:9` or wider.
- The preview feels like a VR panorama rather than a flat crop view.
- The first view auto-rotates slowly without user input.
- Users can manually control camera direction with the mouse.
- Current-view export and geometric multi-view extraction work without backend AI.
- Outputs integrate with existing canvas image and storyboard nodes.
- Existing image-node tools continue to work.

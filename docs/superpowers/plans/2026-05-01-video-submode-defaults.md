# Video Submode Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins configure default submodes for SD2/Happy Horse, Kling O1, and Kling v3 Omni video models, then use those defaults when selecting models in the canvas.

**Architecture:** Store defaults on existing model config fields, expose those non-sensitive fields through `/api/config`, and centralize client fallback selection in a small pure helper. Vue components keep their existing mode UI and only call the helper when resetting mode state.

**Tech Stack:** Vue 3, Vite, Node.js ES modules, Express backend.

---

## File Map

- `bananatenantmanager/src/components/ModelCard.vue`: add default-mode controls to the 9000 model editor and emit stored default fields.
- `bananaapiserver/server/index.js`: include default submode fields in the public tenant config response.
- `bananaapiboard/src/config/tenant.js`: pass default submode fields from public config into available video model objects.
- `bananaapiboard/src/utils/videoSubmodeDefaults.js`: new pure helper for choosing configured defaults with fallback.
- `bananaapiboard/src/utils/videoSubmodeDefaults.test.mjs`: focused tests for configured-default and disabled-default behavior.
- `bananaapiboard/src/components/canvas/nodes/VideoNode.vue`: use the helper when switching Seedance/Happy Horse and Kling models.
- `bananaapiboard/src/views/VideoGeneration.vue`: use the helper for Seedance defaults on the standalone video page.

### Task 1: Add Pure Default Selection Helper

**Files:**
- Create: `bananaapiboard/src/utils/videoSubmodeDefaults.js`
- Test: `bananaapiboard/src/utils/videoSubmodeDefaults.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `bananaapiboard/src/utils/videoSubmodeDefaults.test.mjs`:

```js
import assert from 'node:assert/strict'
import { pickConfiguredSubmode } from './videoSubmodeDefaults.js'

const modes = [
  { value: 'text2video' },
  { value: 'image2video_first' },
  { value: 'multimodal_ref' }
]

assert.equal(
  pickConfiguredSubmode('multimodal_ref', modes),
  'multimodal_ref',
  'uses configured default when present'
)

assert.equal(
  pickConfiguredSubmode('video_edit', modes),
  'text2video',
  'falls back to first available mode when configured default is unavailable'
)

assert.equal(
  pickConfiguredSubmode('', modes, 'text2video'),
  'text2video',
  'uses first available mode when configured default is empty'
)

assert.equal(
  pickConfiguredSubmode('multimodal_ref', [], 'text2video'),
  'text2video',
  'uses fallback when no mode list is available'
)

console.log('videoSubmodeDefaults tests passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bananaapiboard && node src/utils/videoSubmodeDefaults.test.mjs`

Expected: FAIL with module not found for `videoSubmodeDefaults.js`.

- [ ] **Step 3: Write minimal implementation**

Create `bananaapiboard/src/utils/videoSubmodeDefaults.js`:

```js
export function pickConfiguredSubmode(configuredMode, availableModes, fallback = 'text2video') {
  const modes = Array.isArray(availableModes) ? availableModes : []
  if (configuredMode && modes.some(mode => mode?.value === configuredMode)) {
    return configuredMode
  }
  return modes[0]?.value || fallback
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bananaapiboard && node src/utils/videoSubmodeDefaults.test.mjs`

Expected: PASS with `videoSubmodeDefaults tests passed`.

### Task 2: Expose Default Submodes in Public Config

**Files:**
- Modify: `bananaapiserver/server/index.js`
- Modify: `bananaapiboard/src/config/tenant.js`

- [ ] **Step 1: Update public `/api/config` video model mapping**

In `bananaapiserver/server/index.js`, extend the public `video_models` mapping near the existing `seedanceConfig` and `happyHorseConfig` response fields:

```js
defaultVideoMode: model.defaultVideoMode,
defaultSeedance2Mode: model.defaultSeedance2Mode || model.seedanceConfig?.defaultMode,
defaultKlingO1Mode: model.defaultKlingO1Mode,
defaultKlingV3OmniMode: model.defaultKlingV3OmniMode,
seedanceConfig: model.seedanceConfig ? {
  supportedModes: model.seedanceConfig.supportedModes,
  defaultMode: model.seedanceConfig.defaultMode
} : undefined,
happyHorseConfig: model.happyHorseConfig ? {
  supportedModes: model.happyHorseConfig.supportedModes,
  defaultMode: model.happyHorseConfig.defaultMode,
  defaultVideoMode: model.happyHorseConfig.defaultVideoMode
} : undefined
```

- [ ] **Step 2: Pass fields through tenant model normalization**

In `bananaapiboard/src/config/tenant.js`, ensure every constructed video model object includes:

```js
defaultVideoMode: modelConfig.defaultVideoMode || undefined,
defaultSeedance2Mode: modelConfig.defaultSeedance2Mode || modelConfig.seedanceConfig?.defaultMode || undefined,
defaultKlingO1Mode: modelConfig.defaultKlingO1Mode || undefined,
defaultKlingV3OmniMode: modelConfig.defaultKlingV3OmniMode || undefined,
seedanceConfig: modelConfig.seedanceConfig,
happyHorseConfig: modelConfig.happyHorseConfig,
```

Apply this to both the new-format `video_models` path and the fallback legacy model path.

- [ ] **Step 3: Build-check frontend config changes**

Run: `cd bananaapiboard && npm run build`

Expected: Vite build completes successfully.

### Task 3: Add 9000 Default Mode Controls

**Files:**
- Modify: `bananatenantmanager/src/components/ModelCard.vue`

- [ ] **Step 1: Add Seedance/Happy Horse default select**

Inside the Seedance 2.0 / Ant / Happy Horse configuration block, directly after the supported modes grid, add a select labeled `默认生成模式`. The select value should be `model.seedanceConfig?.defaultMode || model.defaultSeedance2Mode || 'text2video'` and call `updateSeedanceDefaultMode($event.target.value)`.

- [ ] **Step 2: Add update function**

Add this function beside `updateSeedanceConfig` and `updateSeedanceSupportedMode`:

```js
function updateSeedanceDefaultMode(value) {
  hasUnsavedChanges.value = true
  const currentConfig = props.model.seedanceConfig || {}
  emit('update', {
    defaultSeedance2Mode: value,
    seedanceConfig: {
      ...currentConfig,
      defaultMode: value
    }
  })
}
```

- [ ] **Step 3: Preserve default when supported mode is disabled**

Do not delete the stored default when an admin disables a mode. Runtime fallback handles invalid defaults, preserving the admin's saved choice if the mode is re-enabled later.

- [ ] **Step 4: Add Kling default select controls**

In the Kling O1 and Kling v3 Omni configuration blocks in `ModelCard.vue`, add matching `默认生成模式` selects backed by `defaultKlingO1Mode` and `defaultKlingV3OmniMode`. Each select should use the existing mode option arrays or the same inline values already used by the corresponding model configuration block.

- [ ] **Step 5: Build-check 9000 UI**

Run: `cd bananatenantmanager && npm run build`

Expected: Vite build completes successfully.

### Task 4: Use Defaults in Canvas and Video Page

**Files:**
- Modify: `bananaapiboard/src/components/canvas/nodes/VideoNode.vue`
- Modify: `bananaapiboard/src/views/VideoGeneration.vue`

- [ ] **Step 1: Import helper**

Add this import in both files:

```js
import { pickConfiguredSubmode } from '@/utils/videoSubmodeDefaults'
```

- [ ] **Step 2: Replace local fallback helper usage for Seedance**

Where Seedance model switches currently call `getFirstAvailableMode(defaultMode, seedance2Modes.value)` or `getFirstAvailableMode(defaultSeedanceMode, seedanceAvailableModes.value)`, replace with:

```js
pickConfiguredSubmode(defaultMode, seedance2Modes.value)
```

for `VideoNode.vue`, and:

```js
pickConfiguredSubmode(defaultSeedanceMode, seedanceAvailableModes.value)
```

for `VideoGeneration.vue`.

- [ ] **Step 3: Replace Kling default assignment**

In `VideoNode.vue`, update Kling O1 and Kling v3 Omni model-switch handlers to use:

```js
selectedKlingO1Mode.value = pickConfiguredSubmode(modelConfig.defaultKlingO1Mode || 'text2video', klingO1Modes.value)
selectedKlingV3OmniMode.value = pickConfiguredSubmode(modelConfig.defaultKlingV3OmniMode || 'text2video', klingV3OmniModes.value)
```

- [ ] **Step 4: Run focused tests**

Run: `cd bananaapiboard && node src/utils/videoSubmodeDefaults.test.mjs`

Expected: PASS with `videoSubmodeDefaults tests passed`.

- [ ] **Step 5: Build-check app**

Run: `cd bananaapiboard && npm run build`

Expected: Vite build completes successfully.

### Task 5: Final Verification

**Files:**
- Review only.

- [ ] **Step 1: Inspect changed fields**

Run:

```bash
git -C bananaapiboard diff -- src/utils/videoSubmodeDefaults.js src/utils/videoSubmodeDefaults.test.mjs src/config/tenant.js src/components/canvas/nodes/VideoNode.vue src/views/VideoGeneration.vue
git -C bananatenantmanager diff -- src/components/ModelCard.vue
git -C bananaapiserver diff -- server/index.js
```

Expected: Diffs only contain default-submode configuration and fallback logic.

- [ ] **Step 2: Run all available build checks**

Run:

```bash
cd bananaapiboard && npm run build
cd ../bananatenantmanager && npm run build
```

Expected: both builds complete successfully.

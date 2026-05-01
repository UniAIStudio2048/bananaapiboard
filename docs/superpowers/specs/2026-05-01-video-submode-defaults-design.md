# Video Submode Defaults Design

## Goal

Allow tenant managers on the 9000 port configuration UI to choose the default submode for video models that expose their own mode selector. When a user selects that model in the canvas video node, the model should open on the configured default submode.

This applies to:

- Seedance 2.0 / Ant / Happy Horse modes: `text2video`, `image2video_first`, `image2video_first_last`, `multimodal_ref`, `video_edit`, `video_extend`.
- Kling O1 modes.
- Kling v3 Omni modes.

This does not add a default selector for ordinary top-level video modes such as generic text/image/audio video filtering.

## Current State

The 9000 model editor already lets admins configure supported Seedance 2.0 modes through `seedanceConfig.supportedModes`. The front end already has partial support for default fields:

- Seedance reads `defaultSeedance2Mode` or `seedanceConfig.defaultMode`.
- Kling O1 reads `defaultKlingO1Mode`.
- Kling v3 Omni reads `defaultKlingV3OmniMode`.

The missing pieces are:

- The 9000 UI does not expose a default submode control for these models.
- The public tenant config returned to the app strips most default submode fields.
- The canvas should consistently validate the configured default against available modes and fall back when it is disabled.

## Design

Add a "default generation mode" select control in the 9000 model configuration UI for each supported submode model type.

For Seedance 2.0 / Ant / Happy Horse, the selected value is stored in `seedanceConfig.defaultMode`. For compatibility, the model-level `defaultSeedance2Mode` should also be populated with the same value where the model editor already writes model-level defaults.

For Kling O1, the selected value is stored as `defaultKlingO1Mode`.

For Kling v3 Omni, the selected value is stored as `defaultKlingV3OmniMode`.

The available options should match the model's existing submode list. If a mode has been disabled in `supportedModes`, it should not be selected as the effective default; the UI may still preserve stored data, but the runtime must fall back to the first enabled mode.

## Data Flow

1. Tenant manager saves model configuration on port 9000.
2. Backend stores the selected default submode with the model configuration.
3. Public `/api/config` includes non-sensitive default submode fields alongside the existing public model fields.
4. `bananaapiboard/src/config/tenant.js` passes those fields through in `getAvailableVideoModels`.
5. `VideoNode.vue` uses the configured default when the user switches to a supported model.
6. `VideoGeneration.vue` should continue using the same default fields so the standalone video page remains consistent.

## Fallbacks

If the configured default submode is missing, disabled, or not present in the available mode list, the client should use the first available mode. If no mode list is available, it should keep the existing fallback of `text2video`.

This preserves existing tenant behavior for models that have no default configured.

## Testing

Add focused tests where practical around the pure/default-selection logic. Manual verification should cover:

- Setting a Seedance 2.0 / Ant / Happy Horse model default to `multimodal_ref` in port 9000.
- Opening the canvas, selecting that model, and seeing the SD2 mode default to "多模态".
- Setting Kling O1 and Kling v3 Omni defaults and verifying their canvas mode buttons default correctly.
- Disabling the configured default mode and confirming the canvas falls back to the first enabled mode.

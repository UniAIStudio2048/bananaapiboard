import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('video mode selector is placed between model and unified video parameter controls', () => {
  const configRowStart = source.indexOf('<div class="config-row">')
  const configRowEnd = source.indexOf('<div class="config-right">', configRowStart)
  assert.ok(configRowStart >= 0, 'video config row should exist')
  assert.ok(configRowEnd > configRowStart, 'video config left controls should exist')

  const configLeft = source.slice(configRowStart, configRowEnd)
  const modelIndex = configLeft.indexOf('class="model-selector-custom"')
  const modeIndex = configLeft.indexOf('class="video-mode-selector"')
  const parametersIndex = configLeft.indexOf('class="video-parameter-selector"')

  assert.ok(modelIndex >= 0, 'model selector should remain visible')
  assert.ok(modeIndex > modelIndex, 'mode selector should follow model selector')
  assert.ok(parametersIndex > modeIndex, 'mode selector should precede unified video parameter selector')
  assert.match(configLeft, /class="video-mode-trigger"/)
  assert.match(configLeft, /class="video-mode-dropdown-panel"/)
  assert.match(configLeft, /v-for="option in activeVideoModeSelector\.options"/)
  assert.doesNotMatch(configLeft, /class="video-mode-select"/)
  assert.match(configLeft, /getVideoModeIconClass\(activeVideoModeSelector\.value\)/)
  assert.match(configLeft, /getVideoModeIconClass\(option\.value\)/)
})

test('video mode selector reuses existing mode state and available option lists', () => {
  assert.match(source, /const activeVideoModeSelector = computed\(\(\) => \{[\s\S]*?selectedSeedance2Mode[\s\S]*?seedance2Modes[\s\S]*?\}\)/)
  assert.match(source, /activeVideoModeSelector[\s\S]*?selectedWanMode\.value[\s\S]*?wanModes/)
  assert.match(source, /activeVideoModeSelector[\s\S]*?selectedKlingV3OmniMode\.value[\s\S]*?klingV3OmniModes/)
  assert.match(source, /function setActiveVideoMode\(value\)\s*\{[\s\S]*?selectedSeedance2Mode\.value\s*=\s*value[\s\S]*?\}/)
  assert.match(source, /function setActiveVideoMode\(value\)\s*\{[\s\S]*?selectedWanMode\.value\s*=\s*value[\s\S]*?\}/)
  assert.match(source, /function setActiveVideoMode\(value\)\s*\{[\s\S]*?selectedKlingV3OmniMode\.value\s*=\s*value[\s\S]*?\}/)
  assert.match(source, /@click="setActiveVideoMode\(option\.value\); videoModeDropdownOpen = null"/)
  assert.match(source, /const activeVideoSubmodeSelector = computed\(\(\) => \{[\s\S]*?selectedWanAnimateMode\.value[\s\S]*?wanAnimateModeOptions[\s\S]*?\}\)/)
  assert.match(source, /@click="setActiveVideoSubmode\(option\.value\); videoModeDropdownOpen = null"/)
  assert.doesNotMatch(source, /v-for="opt in seedance2Modes"[\s\S]*class="sd2-mode-btn"/)
  assert.doesNotMatch(source, /v-for="opt in wanAnimateModeOptions"[\s\S]*class="sd2-mode-btn"/)
})

test('DashScope Wan3 exposes and persists its six-mode selector used for submissions', () => {
  assert.match(source, /WAN3_MODES/)
  assert.match(source, /const isWan3Model = computed\(\(\) => currentModelConfig\.value\?\.apiType === 'wan3'\)/)
  assert.match(source, /const selectedWan3Mode = ref\(props\.data\.wan3Mode \|\| 'text2video'\)/)
  assert.match(source, /if \(isWan3Model\.value\) \{[\s\S]*?key: 'wan3',[\s\S]*?value: selectedWan3Mode\.value,[\s\S]*?options: WAN3_MODES/)
  assert.match(source, /case 'wan3':[\s\S]*?selectedWan3Mode\.value = value/)
  assert.match(source, /watch\(selectedWan3Mode, wan3Mode => \{[\s\S]*?wan3Mode/)
  assert.match(source, /const wan3Mode = capturedState\.wan3Mode \|\| selectedWan3Mode\.value[\s\S]*?formData\.append\('seedance_mode', wan3Mode\)/)
})

test('RouterBee Wan3 uses an independent four-mode canvas adapter without file modes', () => {
  assert.match(source, /ROUTERBEE_WAN3_MODES/)
  assert.match(source, /const isRouterBeeWan3Model = computed\(\(\) => currentModelConfig\.value\?\.apiType === 'routerbee-wan3'\)/)
  assert.match(source, /const selectedRouterBeeWan3Mode = ref\(normalizeRouterBeeWan3Mode\([\s\S]*?props\.data\.routerbeeWan3Mode \|\| props\.data\.wan3Mode \|\| 'text2video'/)
  assert.match(source, /if \(isRouterBeeWan3Model\.value\) \{[\s\S]*?key: 'routerbee-wan3',[\s\S]*?options: ROUTERBEE_WAN3_MODES/)
  assert.match(source, /case 'routerbee-wan3':[\s\S]*?selectedRouterBeeWan3Mode\.value = value/)
  assert.match(source, /watch\(selectedRouterBeeWan3Mode, routerbeeWan3Mode => \{[\s\S]*?routerbeeWan3Mode/)
  assert.match(source, /capturedState\.apiType === 'routerbee-wan3'[\s\S]*?routerbeeWan3Mode[\s\S]*?first_frame_image[\s\S]*?last_frame_image[\s\S]*?reference_images[\s\S]*?reference_videos[\s\S]*?reference_audios/)

  const routerBeeSelectorStart = source.indexOf("key: 'routerbee-wan3'")
  const routerBeeSelectorEnd = source.indexOf('}', routerBeeSelectorStart)
  const routerBeeSelector = source.slice(routerBeeSelectorStart, routerBeeSelectorEnd)
  assert.doesNotMatch(routerBeeSelector, /options: WAN3_MODES/)
  assert.doesNotMatch(routerBeeSelector, /file|link/)
})

test('Wan3 file and link modes have independent persistent inputs and request fields', () => {
  assert.match(source, /import \{ uploadCanvasDocument \} from '@\/api\/canvas\/direct-upload'/)
  assert.match(source, /const wan3File = ref\(props\.data\.wan3File \|\| null\)/)
  assert.match(source, /const wan3Link = ref\(props\.data\.wan3Link \|\| ''\)/)
  assert.match(source, /async function uploadWan3Document\(file\)[\s\S]*?uploadCanvasDocument\(uploadFile, \{ nodeId: props\.id, tabId: canvasStore\.activeTabId \}\)/)
  assert.match(source, /wan3File: isWan3Model\.value \? wan3File\.value : null,\s*wan3Link: isWan3Model\.value \? wan3Link\.value : ''/)
  assert.match(source, /wan3FileUrl[\s\S]*?formData\.append\('wan3_files', JSON\.stringify\(\[wan3FileUrl\]\)\)/)
  assert.match(source, /wan3Link[\s\S]*?formData\.append\('wan3_links', JSON\.stringify\(\[wan3Link\]\)\)/)
  assert.match(source, /class="wan3-attachment-toolbar"/)
  assert.match(source, /const wan3AttachmentPanel = ref\(''\)/)
  assert.match(source, /@click="toggleWan3AttachmentPanel\('file'\)"/)
  assert.match(source, /@click="toggleWan3AttachmentPanel\('link'\)"/)
  assert.match(source, /class="[^\"]*wan3-document-upload-popover"/)
  assert.match(source, /@drop\.prevent="handleWan3DocumentDrop"/)
  assert.match(source, /@click="triggerWan3DocumentPicker"/)
  assert.match(source, /v-if="isWan3Model && wan3AttachmentPanel === 'link'"/)
  assert.match(source, /v-model="wan3LinkDraft"/)
  assert.match(source, /@click="addWan3Link"/)
})

test('Wan3 rejects files or links mixed with frame and reference inputs', () => {
  assert.match(source, /万相 3\.0 文件和网页链接不能同时使用/)
  assert.match(source, /万相 3\.0 文件或网页链接不能与首尾帧、参考素材同时使用/)
})

test('Wan3 attachment popover closes when prompt input regains interaction', () => {
  assert.match(source, /function handlePromptTextareaFocus\(\) \{\s*wan3AttachmentPanel\.value = ''\s*updatePromptOverlayCaret\(\)/)
  assert.match(source, /@mousedown\.stop="wan3AttachmentPanel = ''; markPromptTextareaResizeIntent\(\$event\)"/)
})

test('video ratio, resolution, and duration share one dropdown trigger', () => {
  const configRowStart = source.indexOf('<div class="config-row">')
  const configRowEnd = source.indexOf('<div class="config-right">', configRowStart)
  const configLeft = source.slice(configRowStart, configRowEnd)

  assert.match(source, /import VideoParametersDropdown from '\.\.\/VideoParametersDropdown\.vue'/)
  assert.match(configLeft, /class="video-parameter-selector"/)
  assert.match(configLeft, /<VideoParametersDropdown/)
  assert.match(configLeft, /:aspect-ratios="availableAspectRatios"/)
  assert.match(configLeft, /v-model:aspect-ratio="selectedAspectRatio"/)
  assert.match(configLeft, /:resolution-options="videoParameterResolutionOptions"/)
  assert.match(configLeft, /v-model:resolution="selectedVideoParameterResolution"/)
  assert.match(configLeft, /:duration-options="durations"/)
  assert.match(configLeft, /:duration="selectedDuration"/)
  assert.match(configLeft, /@update:duration="selectVideoDuration"/)
  assert.doesNotMatch(configLeft, /class="ratio-selector"/)
  assert.doesNotMatch(configLeft, /class="param-chip-group"/)
  assert.doesNotMatch(configLeft, /class="duration-select-row"/)
})

test('video aspect ratios follow model configuration and include square and portrait variants', () => {
  assert.match(source, /const availableAspectRatios = computed\(\(\) => \{[\s\S]*currentModelConfig\.value\?\.aspectRatios[\s\S]*if \(configuredValues\.length === 0\) return \[\]/)
  for (const ratio of ['1:1', '3:4', '4:3']) {
    assert.match(source, new RegExp(`value: '${ratio}'`))
  }
  assert.match(source, /:aspect-ratios="availableAspectRatios"/)
})

test('video duration and ratio selections can both be empty', () => {
  assert.match(source, /if \(options\.length === 0\) \{[\s\S]*selectedAspectRatio\.value = ''/)
  assert.match(source, /if \(options\.length === 0\) \{[\s\S]*selectedDuration\.value = ''/)
  assert.match(source, /if \(selectedAspectRatio\.value\) \{\s*formData\.append\('aspect_ratio'/)
  assert.match(source, /&& selectedDuration\.value\) \{\s*formData\.append\('duration'/)
})

test('video preview uses the selected ratio instead of treating every non-portrait ratio as 16:9', () => {
  assert.match(source, /const parsed = parseAspectRatioValue\(ratio\)[\s\S]*aspectRatio: `\$\{parsed\.width\} \/ \$\{parsed\.height\}`/)
})

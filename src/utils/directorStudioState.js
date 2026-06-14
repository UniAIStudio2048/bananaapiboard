export const DIRECTOR_STUDIO_NODE_TYPE = 'director-studio'
export const MAX_DIRECTOR_SNAPSHOT_HISTORY = 10

export const DIRECTOR_CAMERA_PRESETS = [
  { id: 'standard', fov: 39.6, labelKey: 'directorStudio.cameraPresets.standard' },
  { id: 'wide', fov: 73.7, labelKey: 'directorStudio.cameraPresets.wide' },
  { id: 'ultraWide', fov: 96.7, labelKey: 'directorStudio.cameraPresets.ultraWide' },
  { id: 'portrait', fov: 23.9, labelKey: 'directorStudio.cameraPresets.portrait' },
  { id: 'telephoto', fov: 15.2, labelKey: 'directorStudio.cameraPresets.telephoto' },
  { id: 'superTelephoto', fov: 10.3, labelKey: 'directorStudio.cameraPresets.superTelephoto' },
  { id: 'fisheye', fov: 150, labelKey: 'directorStudio.cameraPresets.fisheye' }
]

export const DIRECTOR_ASPECT_FRAMES = [
  { value: 'panorama', labelKey: 'directorStudio.aspectFrames.panorama', ratio: null },
  { value: '1:1', labelKey: 'directorStudio.aspectFrames.square', ratio: 1 },
  { value: '4:3', labelKey: 'directorStudio.aspectFrames.fourThree', ratio: 4 / 3 },
  { value: '3:4', labelKey: 'directorStudio.aspectFrames.threeFour', ratio: 3 / 4 },
  { value: '16:9', labelKey: 'directorStudio.aspectFrames.sixteenNine', ratio: 16 / 9 },
  { value: '9:16', labelKey: 'directorStudio.aspectFrames.nineSixteen', ratio: 9 / 16 },
  { value: '3:2', labelKey: 'directorStudio.aspectFrames.threeTwo', ratio: 3 / 2 },
  { value: '2:3', labelKey: 'directorStudio.aspectFrames.twoThree', ratio: 2 / 3 },
  { value: '21:9', labelKey: 'directorStudio.aspectFrames.twentyOneNine', ratio: 21 / 9 }
]

export const DIRECTOR_SCREENSHOT_RESOLUTIONS = [
  { value: '1080p', labelKey: 'directorStudio.resolutions.p1080', base: 1080 },
  { value: '1440p', labelKey: 'directorStudio.resolutions.p1440', base: 1440 },
  { value: '4k', labelKey: 'directorStudio.resolutions.k4', base: 2160 }
]

export const DEFAULT_DIRECTOR_CAMERA = { fov: 39.6, lensDistance: 8, activePreset: 'standard' }
export const DEFAULT_DIRECTOR_LIGHTING = {
  enabled: true,
  mainIntensity: 0.65,
  mainYaw: 35,
  mainPitch: 50,
  mainColor: '#ffffff',
  ambientIntensity: 0.55,
  ambientColor: '#ffffff'
}
export const DEFAULT_DIRECTOR_GRID = { visible: true, height: 0 }
export const DEFAULT_DIRECTOR_VIEW_SETTINGS = {
  wheelZoomEnabled: true,
  reverseWheelZoom: false,
  showAdvancedPedestrianTags: false
}
export const DEFAULT_DIRECTOR_STUDIO_SHORTCUTS = {
  transformMove: '1',
  transformRotate: '2',
  transformScale: '3',
  focus: 'F',
  fit: 'Z',
  reset: 'R',
  screenshot: 'C',
  model: 'M',
  lighting: 'L',
  grid: 'G',
  prompt: 'P',
  shortcuts: 'H',
  save: 'Cmd/Ctrl+S',
  delete: 'Delete',
  copy: 'Cmd/Ctrl+C',
  paste: 'Cmd/Ctrl+V',
  undo: 'Cmd/Ctrl+Z',
  redo: 'Cmd/Ctrl+Shift+Z',
  advancedPedestrianTags: 'T'
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function normalizeDirectorColor(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeDirectorString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeDirectorNullableString(value) {
  const normalized = normalizeDirectorString(value, '')
  return normalized || null
}

function normalizeFiniteTimestamp(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function clampDirectorNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

export function normalizeDirectorMode(value) {
  return value === 'panorama' ? 'panorama' : 'flat'
}

export function normalizeDirectorCamera(camera) {
  const activePreset = DIRECTOR_CAMERA_PRESETS.some(preset => preset.id === camera?.activePreset)
    ? camera.activePreset
    : DEFAULT_DIRECTOR_CAMERA.activePreset

  return {
    fov: clampDirectorNumber(camera?.fov, DEFAULT_DIRECTOR_CAMERA.fov, 10, 150),
    lensDistance: clampDirectorNumber(camera?.lensDistance, DEFAULT_DIRECTOR_CAMERA.lensDistance, 2, 30),
    activePreset
  }
}

export function normalizeDirectorLighting(lighting) {
  return {
    enabled: typeof lighting?.enabled === 'boolean' ? lighting.enabled : DEFAULT_DIRECTOR_LIGHTING.enabled,
    mainIntensity: clampDirectorNumber(lighting?.mainIntensity, DEFAULT_DIRECTOR_LIGHTING.mainIntensity, 0, 4),
    mainYaw: clampDirectorNumber(lighting?.mainYaw, DEFAULT_DIRECTOR_LIGHTING.mainYaw, -180, 180),
    mainPitch: clampDirectorNumber(lighting?.mainPitch, DEFAULT_DIRECTOR_LIGHTING.mainPitch, -20, 90),
    mainColor: normalizeDirectorColor(lighting?.mainColor, DEFAULT_DIRECTOR_LIGHTING.mainColor),
    ambientIntensity: clampDirectorNumber(lighting?.ambientIntensity, DEFAULT_DIRECTOR_LIGHTING.ambientIntensity, 0, 3),
    ambientColor: normalizeDirectorColor(lighting?.ambientColor, DEFAULT_DIRECTOR_LIGHTING.ambientColor)
  }
}

export function normalizeDirectorGrid(grid) {
  return {
    visible: typeof grid?.visible === 'boolean' ? grid.visible : DEFAULT_DIRECTOR_GRID.visible,
    height: clampDirectorNumber(grid?.height, DEFAULT_DIRECTOR_GRID.height, -20, 20)
  }
}

export function normalizeDirectorViewSettings(viewSettings) {
  return {
    wheelZoomEnabled: typeof viewSettings?.wheelZoomEnabled === 'boolean'
      ? viewSettings.wheelZoomEnabled
      : DEFAULT_DIRECTOR_VIEW_SETTINGS.wheelZoomEnabled,
    reverseWheelZoom: typeof viewSettings?.reverseWheelZoom === 'boolean'
      ? viewSettings.reverseWheelZoom
      : DEFAULT_DIRECTOR_VIEW_SETTINGS.reverseWheelZoom,
    showAdvancedPedestrianTags: typeof viewSettings?.showAdvancedPedestrianTags === 'boolean'
      ? viewSettings.showAdvancedPedestrianTags
      : DEFAULT_DIRECTOR_VIEW_SETTINGS.showAdvancedPedestrianTags
  }
}

export function normalizeDirectorStudioShortcuts(shortcuts) {
  const normalized = cloneJson(DEFAULT_DIRECTOR_STUDIO_SHORTCUTS)
  if (!shortcuts || typeof shortcuts !== 'object' || Array.isArray(shortcuts)) return normalized

  for (const key of Object.keys(DEFAULT_DIRECTOR_STUDIO_SHORTCUTS)) {
    if (typeof shortcuts[key] === 'string' && shortcuts[key].trim()) {
      normalized[key] = shortcuts[key].trim()
    }
  }

  return normalized
}

export function normalizeDirectorAspectFrame(value, fallback = '16:9') {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (DIRECTOR_ASPECT_FRAMES.some(frame => frame.value === normalized)) return normalized
  return DIRECTOR_ASPECT_FRAMES.some(frame => frame.value === fallback) ? fallback : '16:9'
}

export function normalizeDirectorScreenshotResolution(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return DIRECTOR_SCREENSHOT_RESOLUTIONS.some(resolution => resolution.value === normalized)
    ? normalized
    : DIRECTOR_SCREENSHOT_RESOLUTIONS[0].value
}

export function normalizeDirectorSnapshotHistory(snapshotUrl, snapshotHistory) {
  return appendDirectorSnapshotHistory(snapshotHistory, snapshotUrl)
}

export function appendDirectorSnapshotHistory(snapshotHistory, snapshotUrl) {
  const urls = Array.isArray(snapshotHistory) ? snapshotHistory : []
  const uniqueUrls = []

  for (const item of urls) {
    const url = typeof item === 'string' ? item.trim() : ''
    if (url && !uniqueUrls.includes(url)) uniqueUrls.push(url)
  }

  const nextUrl = typeof snapshotUrl === 'string' ? snapshotUrl.trim() : ''
  const withoutNext = nextUrl ? uniqueUrls.filter(url => url !== nextUrl) : uniqueUrls
  const history = nextUrl ? [...withoutNext, nextUrl] : withoutNext

  return history.slice(-MAX_DIRECTOR_SNAPSHOT_HISTORY)
}

export function createDirectorBlankSnapshot() {
  return {
    mode: 'flat',
    backgroundImageUrl: null,
    backgroundPanoramaUrl: null,
    items: [],
    referenceImages: [],
    customActionPresets: [],
    customActionPoses: {},
    basePrompt: '',
    themeColor: null,
    camera: cloneJson(DEFAULT_DIRECTOR_CAMERA),
    lighting: cloneJson(DEFAULT_DIRECTOR_LIGHTING),
    grid: cloneJson(DEFAULT_DIRECTOR_GRID),
    viewSettings: cloneJson(DEFAULT_DIRECTOR_VIEW_SETTINGS),
    directorStudioShortcuts: cloneJson(DEFAULT_DIRECTOR_STUDIO_SHORTCUTS),
    aspectRatio: '16:9',
    aspectFrame: '16:9',
    screenshotResolution: DIRECTOR_SCREENSHOT_RESOLUTIONS[0].value,
    snapshotUrl: null,
    snapshotHistory: []
  }
}

export function normalizeDirectorSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return createDirectorBlankSnapshot()

  const snapshotUrl = normalizeDirectorNullableString(snapshot.snapshotUrl)

  return {
    mode: normalizeDirectorMode(snapshot.mode),
    backgroundImageUrl: normalizeDirectorNullableString(snapshot.backgroundImageUrl),
    backgroundPanoramaUrl: normalizeDirectorNullableString(snapshot.backgroundPanoramaUrl),
    items: Array.isArray(snapshot.items) ? cloneJson(snapshot.items) : [],
    referenceImages: Array.isArray(snapshot.referenceImages) ? cloneJson(snapshot.referenceImages) : [],
    customActionPresets: Array.isArray(snapshot.customActionPresets) ? cloneJson(snapshot.customActionPresets) : [],
    customActionPoses: snapshot.customActionPoses && typeof snapshot.customActionPoses === 'object' && !Array.isArray(snapshot.customActionPoses)
      ? cloneJson(snapshot.customActionPoses)
      : {},
    basePrompt: normalizeDirectorString(snapshot.basePrompt, ''),
    themeColor: normalizeDirectorNullableString(snapshot.themeColor),
    aspectRatio: normalizeDirectorString(snapshot.aspectRatio, '') || '16:9',
    camera: normalizeDirectorCamera(snapshot.camera),
    lighting: normalizeDirectorLighting(snapshot.lighting),
    grid: normalizeDirectorGrid(snapshot.grid),
    viewSettings: normalizeDirectorViewSettings(snapshot.viewSettings),
    directorStudioShortcuts: normalizeDirectorStudioShortcuts(snapshot.directorStudioShortcuts),
    aspectFrame: normalizeDirectorAspectFrame(snapshot.aspectFrame),
    screenshotResolution: normalizeDirectorScreenshotResolution(snapshot.screenshotResolution),
    snapshotUrl,
    snapshotHistory: normalizeDirectorSnapshotHistory(snapshotUrl, snapshot.snapshotHistory)
  }
}

export function captureDirectorSnapshot(data, snapshotUrl) {
  const snapshot = createDirectorBlankSnapshot()
  const url = typeof snapshotUrl === 'string' && snapshotUrl.trim() ? snapshotUrl.trim() : null

  return {
    ...snapshot,
    mode: normalizeDirectorMode(data?.mode),
    backgroundImageUrl: normalizeDirectorNullableString(data?.backgroundImageUrl),
    backgroundPanoramaUrl: normalizeDirectorNullableString(data?.backgroundPanoramaUrl),
    items: Array.isArray(data?.items) ? cloneJson(data.items) : [],
    referenceImages: Array.isArray(data?.referenceImages) ? cloneJson(data.referenceImages) : [],
    customActionPresets: Array.isArray(data?.customActionPresets) ? cloneJson(data.customActionPresets) : [],
    customActionPoses: data?.customActionPoses && typeof data.customActionPoses === 'object' && !Array.isArray(data.customActionPoses)
      ? cloneJson(data.customActionPoses)
      : {},
    basePrompt: normalizeDirectorString(data?.basePrompt, ''),
    themeColor: normalizeDirectorNullableString(data?.themeColor),
    camera: normalizeDirectorCamera(data?.camera),
    lighting: normalizeDirectorLighting(data?.lighting),
    grid: normalizeDirectorGrid(data?.grid),
    viewSettings: normalizeDirectorViewSettings(data?.viewSettings),
    aspectRatio: typeof data?.aspectRatio === 'string' && data.aspectRatio.trim() ? data.aspectRatio.trim() : '16:9',
    aspectFrame: normalizeDirectorAspectFrame(data?.aspectFrame),
    screenshotResolution: normalizeDirectorScreenshotResolution(data?.screenshotResolution),
    snapshotUrl: url,
    snapshotHistory: normalizeDirectorSnapshotHistory(url, data?.snapshotHistory)
  }
}

export function normalizeDirectorProjectRecord(project) {
  if (!project || typeof project !== 'object') return null

  const id = typeof project.id === 'string' && project.id.trim() ? project.id.trim() : null
  if (!id) return null

  const updatedAt = normalizeFiniteTimestamp(project.updatedAt, Date.now())
  const createdAt = normalizeFiniteTimestamp(project.createdAt, updatedAt)
  const name = typeof project.name === 'string' && project.name.trim() ? project.name.trim() : id

  return {
    ...cloneJson(project),
    id,
    name,
    createdAt,
    updatedAt,
    snapshot: normalizeDirectorSnapshot(project.snapshot)
  }
}

export function createDefaultDirectorStudioData(overrides = {}) {
  const outputUrl = typeof overrides.output?.url === 'string' && overrides.output.url.trim()
    ? overrides.output.url.trim()
    : null
  const outputUrls = Array.isArray(overrides.output?.urls)
    ? overrides.output.urls.filter(url => typeof url === 'string' && url.trim()).map(url => url.trim())
    : []

  return {
    title: typeof overrides.title === 'string' && overrides.title.trim() ? overrides.title.trim() : '3D导演台',
    label: typeof overrides.label === 'string' && overrides.label.trim() ? overrides.label.trim() : '3D导演台',
    mode: normalizeDirectorMode(overrides.mode),
    backgroundImageUrl: normalizeDirectorNullableString(overrides.backgroundImageUrl),
    backgroundPanoramaUrl: normalizeDirectorNullableString(overrides.backgroundPanoramaUrl),
    items: Array.isArray(overrides.items) ? cloneJson(overrides.items) : [],
    referenceImages: Array.isArray(overrides.referenceImages) ? cloneJson(overrides.referenceImages) : [],
    customActionPresets: Array.isArray(overrides.customActionPresets) ? cloneJson(overrides.customActionPresets) : [],
    customActionPoses: overrides.customActionPoses && typeof overrides.customActionPoses === 'object' && !Array.isArray(overrides.customActionPoses)
      ? cloneJson(overrides.customActionPoses)
      : {},
    basePrompt: normalizeDirectorString(overrides.basePrompt, ''),
    themeColor: normalizeDirectorString(overrides.themeColor, '') || '#38bdf8',
    openDirectorStudioOnCreate: typeof overrides.openDirectorStudioOnCreate === 'boolean'
      ? overrides.openDirectorStudioOnCreate
      : false,
    sourceImages: Array.isArray(overrides.sourceImages) ? cloneJson(overrides.sourceImages) : [],
    status: typeof overrides.status === 'string' && overrides.status.trim() ? overrides.status.trim() : 'idle',
    camera: normalizeDirectorCamera(overrides.camera),
    lighting: normalizeDirectorLighting(overrides.lighting),
    grid: normalizeDirectorGrid(overrides.grid),
    viewSettings: normalizeDirectorViewSettings(overrides.viewSettings),
    directorStudioShortcuts: normalizeDirectorStudioShortcuts(overrides.directorStudioShortcuts),
    aspectRatio: typeof overrides.aspectRatio === 'string' && overrides.aspectRatio.trim() ? overrides.aspectRatio.trim() : '16:9',
    aspectFrame: normalizeDirectorAspectFrame(overrides.aspectFrame),
    screenshotResolution: normalizeDirectorScreenshotResolution(overrides.screenshotResolution),
    snapshotUrl: typeof overrides.snapshotUrl === 'string' && overrides.snapshotUrl.trim() ? overrides.snapshotUrl.trim() : null,
    snapshotHistory: normalizeDirectorSnapshotHistory(overrides.snapshotUrl, overrides.snapshotHistory),
    directorStudioProjects: Array.isArray(overrides.directorStudioProjects)
      ? overrides.directorStudioProjects.map(normalizeDirectorProjectRecord).filter(Boolean)
      : [],
    activeDirectorStudioProjectId: typeof overrides.activeDirectorStudioProjectId === 'string' && overrides.activeDirectorStudioProjectId.trim()
      ? overrides.activeDirectorStudioProjectId.trim()
      : null,
    output: {
      url: outputUrl,
      urls: outputUrls
    }
  }
}

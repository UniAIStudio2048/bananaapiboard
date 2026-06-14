import assert from 'node:assert/strict'
import {
  DEFAULT_DIRECTOR_CAMERA,
  DEFAULT_DIRECTOR_GRID,
  DEFAULT_DIRECTOR_LIGHTING,
  DEFAULT_DIRECTOR_STUDIO_SHORTCUTS,
  DEFAULT_DIRECTOR_VIEW_SETTINGS,
  appendDirectorSnapshotHistory,
  captureDirectorSnapshot,
  createDefaultDirectorStudioData,
  createDirectorBlankSnapshot,
  normalizeDirectorCamera,
  normalizeDirectorLighting,
  normalizeDirectorMode,
  normalizeDirectorProjectRecord,
  normalizeDirectorSnapshot,
  normalizeDirectorSnapshotHistory
} from './directorStudioState.js'

const defaults = createDefaultDirectorStudioData()
assert.equal(defaults.title, '3D导演台')
assert.equal(defaults.label, '3D导演台')
assert.equal(defaults.mode, 'flat')
assert.deepEqual(defaults.items, [])
assert.equal(defaults.backgroundImageUrl, null)
assert.equal(defaults.backgroundPanoramaUrl, null)
assert.deepEqual(defaults.referenceImages, [])
assert.deepEqual(defaults.customActionPresets, [])
assert.deepEqual(defaults.customActionPoses, {})
assert.equal(defaults.basePrompt, '')
assert.equal(defaults.themeColor, '#38bdf8')
assert.deepEqual(defaults.camera, DEFAULT_DIRECTOR_CAMERA)
assert.deepEqual(defaults.lighting, DEFAULT_DIRECTOR_LIGHTING)
assert.deepEqual(defaults.grid, DEFAULT_DIRECTOR_GRID)
assert.deepEqual(defaults.viewSettings, DEFAULT_DIRECTOR_VIEW_SETTINGS)
assert.deepEqual(defaults.directorStudioShortcuts, DEFAULT_DIRECTOR_STUDIO_SHORTCUTS)
assert.equal(defaults.snapshotUrl, null)
assert.deepEqual(defaults.snapshotHistory, [])
assert.deepEqual(defaults.directorStudioProjects, [])
assert.equal(defaults.activeDirectorStudioProjectId, null)
assert.equal(defaults.openDirectorStudioOnCreate, false)
assert.deepEqual(defaults.sourceImages, [])
assert.equal(defaults.status, 'idle')
assert.equal(defaults.aspectFrame, '16:9')
assert.equal(defaults.screenshotResolution, '1080p')
assert.deepEqual(defaults.output, { url: null, urls: [] })
assert.equal(Object.prototype.hasOwnProperty.call(defaults, 'type'), false)
assert.equal(Object.prototype.hasOwnProperty.call(defaults, 'projects'), false)
assert.equal(Object.prototype.hasOwnProperty.call(defaults, 'backgroundUrl'), false)

assert.equal(normalizeDirectorMode('flat'), 'flat')
assert.equal(normalizeDirectorMode('panorama'), 'panorama')
assert.equal(normalizeDirectorMode('three'), 'flat')
assert.equal(createDefaultDirectorStudioData({ mode: 'panorama' }).mode, 'panorama')
assert.equal(createDefaultDirectorStudioData({ mode: 'three' }).mode, 'flat')
assert.equal(captureDirectorSnapshot({ mode: 'panorama' }, 'https://cdn/pano.png').mode, 'panorama')
assert.equal(captureDirectorSnapshot({ mode: 'three' }, 'https://cdn/flat.png').mode, 'flat')
assert.equal(normalizeDirectorSnapshot({ mode: 'panorama' }).mode, 'panorama')
assert.equal(normalizeDirectorSnapshot({ mode: 'three' }).mode, 'flat')

const customized = createDefaultDirectorStudioData({ directorStudioShortcuts: { screenshot: 'S' } })
assert.equal(customized.directorStudioShortcuts.screenshot, 'S')
assert.equal(customized.directorStudioShortcuts.model, DEFAULT_DIRECTOR_STUDIO_SHORTCUTS.model)

assert.deepEqual(normalizeDirectorCamera({ fov: 400, lensDistance: -1 }), {
  ...DEFAULT_DIRECTOR_CAMERA,
  fov: 150,
  lensDistance: 2
})
assert.equal(normalizeDirectorCamera({ lensDistance: 120 }).lensDistance, 80)

const lighting = normalizeDirectorLighting({
  enabled: false,
  mainIntensity: 8,
  mainYaw: 300,
  mainPitch: -90,
  mainColor: '#ffeeaa',
  ambientIntensity: 9,
  ambientColor: '#111111'
})
assert.equal(lighting.enabled, false)
assert.equal(lighting.mainIntensity, 4)
assert.equal(lighting.mainYaw, 180)
assert.equal(lighting.mainPitch, -20)
assert.equal(lighting.ambientIntensity, 3)
assert.equal(normalizeDirectorLighting({ mainPitch: 120 }).mainPitch, 89)

const history = normalizeDirectorSnapshotHistory('https://cdn/new.png', [
  'https://cdn/a.png',
  'https://cdn/a.png',
  '',
  null,
  'https://cdn/b.png'
])
assert.deepEqual(history, ['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/new.png'])

const maxed = appendDirectorSnapshotHistory(
  Array.from({ length: 10 }, (_, index) => `https://cdn/${index}.png`),
  'https://cdn/10.png'
)
assert.equal(maxed.length, 10)
assert.equal(maxed[0], 'https://cdn/1.png')
assert.equal(maxed[9], 'https://cdn/10.png')

const blank = createDirectorBlankSnapshot()
assert.equal(blank.mode, 'flat')
assert.equal(blank.backgroundImageUrl, null)
assert.equal(blank.backgroundPanoramaUrl, null)
assert.deepEqual(blank.referenceImages, [])
assert.deepEqual(blank.customActionPresets, [])
assert.deepEqual(blank.customActionPoses, {})
assert.equal(blank.basePrompt, '')
assert.equal(blank.themeColor, null)
assert.equal(Object.prototype.hasOwnProperty.call(blank, 'backgroundUrl'), false)
assert.equal(blank.aspectRatio, '16:9')
assert.deepEqual(blank.snapshotHistory, [])

const primitiveSnapshotProject = normalizeDirectorProjectRecord({
  id: 'primitive-snapshot',
  updatedAt: 456,
  snapshot: 'bad'
})
assert.deepEqual(primitiveSnapshotProject.snapshot, createDirectorBlankSnapshot())

const malformedSnapshot = normalizeDirectorSnapshot({
  mode: 'three',
  backgroundUrl: 123,
  backgroundImageUrl: ' https://cdn/bg.png ',
  backgroundPanoramaUrl: 456,
  items: 'bad',
  referenceImages: 'bad',
  customActionPresets: 'bad',
  customActionPoses: null,
  basePrompt: 123,
  themeColor: 123,
  aspectRatio: '',
  camera: { fov: 999 },
  lighting: { mainIntensity: 99 },
  grid: { height: 999 },
  viewSettings: { wheelZoomEnabled: 'bad' },
  directorStudioShortcuts: { screenshot: 'S' },
  aspectFrame: 'bad',
  screenshotResolution: 'bad',
  snapshotUrl: ' https://cdn/snap.png ',
  snapshotHistory: ['https://cdn/a.png', 'https://cdn/a.png', '', 'https://cdn/b.png']
})
assert.equal(malformedSnapshot.mode, 'flat')
assert.equal(Object.prototype.hasOwnProperty.call(malformedSnapshot, 'backgroundUrl'), false)
assert.equal(malformedSnapshot.backgroundImageUrl, 'https://cdn/bg.png')
assert.equal(malformedSnapshot.backgroundPanoramaUrl, null)
assert.deepEqual(malformedSnapshot.items, [])
assert.deepEqual(malformedSnapshot.referenceImages, [])
assert.deepEqual(malformedSnapshot.customActionPresets, [])
assert.deepEqual(malformedSnapshot.customActionPoses, {})
assert.equal(malformedSnapshot.basePrompt, '')
assert.equal(malformedSnapshot.themeColor, null)
assert.equal(malformedSnapshot.aspectRatio, '16:9')
assert.equal(malformedSnapshot.camera.fov, 150)
assert.equal(malformedSnapshot.lighting.mainIntensity, 4)
assert.equal(malformedSnapshot.grid.height, 20)
assert.deepEqual(malformedSnapshot.viewSettings, DEFAULT_DIRECTOR_VIEW_SETTINGS)
assert.equal(malformedSnapshot.directorStudioShortcuts.screenshot, 'S')
assert.equal(malformedSnapshot.aspectFrame, '16:9')
assert.equal(malformedSnapshot.screenshotResolution, '1080p')
assert.equal(malformedSnapshot.snapshotUrl, 'https://cdn/snap.png')
assert.deepEqual(malformedSnapshot.snapshotHistory, [
  'https://cdn/a.png',
  'https://cdn/b.png',
  'https://cdn/snap.png'
])

const capturedPanorama = captureDirectorSnapshot({
  mode: 'panorama',
  backgroundPanoramaUrl: ' https://cdn/pano.jpg ',
  referenceImages: ['https://cdn/ref.png'],
  customActionPresets: [{ id: 'wave' }],
  customActionPoses: { hero: { action: 'wave' } },
  basePrompt: ' cinematic stage ',
  themeColor: ' #f97316 ',
  camera: { fov: 73.7 },
  snapshotHistory: ['https://cdn/old.png']
}, 'https://cdn/capture.png')
assert.equal(capturedPanorama.mode, 'panorama')
assert.equal(capturedPanorama.backgroundPanoramaUrl, 'https://cdn/pano.jpg')
assert.deepEqual(capturedPanorama.referenceImages, ['https://cdn/ref.png'])
assert.deepEqual(capturedPanorama.customActionPresets, [{ id: 'wave' }])
assert.deepEqual(capturedPanorama.customActionPoses, { hero: { action: 'wave' } })
assert.equal(capturedPanorama.basePrompt, 'cinematic stage')
assert.equal(capturedPanorama.themeColor, '#f97316')

const roundTripProject = normalizeDirectorProjectRecord({
  id: 'round-trip',
  updatedAt: 789,
  snapshot: capturedPanorama
})
assert.equal(roundTripProject.snapshot.mode, 'panorama')
assert.equal(roundTripProject.snapshot.backgroundPanoramaUrl, 'https://cdn/pano.jpg')
assert.deepEqual(roundTripProject.snapshot.referenceImages, ['https://cdn/ref.png'])
assert.deepEqual(roundTripProject.snapshot.customActionPresets, [{ id: 'wave' }])
assert.deepEqual(roundTripProject.snapshot.customActionPoses, { hero: { action: 'wave' } })
assert.equal(roundTripProject.snapshot.basePrompt, 'cinematic stage')
assert.equal(roundTripProject.snapshot.themeColor, '#f97316')

assert.equal(normalizeDirectorProjectRecord(null), null)
const project = normalizeDirectorProjectRecord({
  id: 'project-a',
  name: '',
  createdAt: Number.NaN,
  updatedAt: 123,
  snapshot: blank
})
assert.equal(project.id, 'project-a')
assert.equal(project.name, 'project-a')
assert.equal(project.createdAt, 123)
assert.equal(project.updatedAt, 123)

console.log('directorStudioState tests passed')

import assert from 'node:assert/strict'
import {
  DEFAULT_DIRECTOR_CAMERA,
  DEFAULT_DIRECTOR_GRID,
  DEFAULT_DIRECTOR_LIGHTING,
  DEFAULT_DIRECTOR_STUDIO_SHORTCUTS,
  DEFAULT_DIRECTOR_VIEW_SETTINGS,
  appendDirectorSnapshotHistory,
  createDefaultDirectorStudioData,
  createDirectorBlankSnapshot,
  normalizeDirectorCamera,
  normalizeDirectorLighting,
  normalizeDirectorProjectRecord,
  normalizeDirectorSnapshotHistory
} from './directorStudioState.js'

const defaults = createDefaultDirectorStudioData()
assert.equal(defaults.title, '3D导演台')
assert.equal(defaults.label, '3D导演台')
assert.equal(defaults.mode, 'flat')
assert.deepEqual(defaults.items, [])
assert.deepEqual(defaults.referenceImages, [])
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
assert.equal(Object.prototype.hasOwnProperty.call(defaults, 'projects'), false)

assert.deepEqual(normalizeDirectorCamera({ fov: 400, lensDistance: -1 }), {
  ...DEFAULT_DIRECTOR_CAMERA,
  fov: 150,
  lensDistance: 2
})

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
assert.equal(blank.aspectRatio, '16:9')
assert.deepEqual(blank.snapshotHistory, [])

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

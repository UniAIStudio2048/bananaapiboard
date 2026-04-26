import assert from 'node:assert/strict'
import {
  getPanoramaRatioOption,
  getPresetPanoramaViews,
  getProjectionCameraSettings,
  isPanorama21x9,
  isPanoramaVrSupportedRatio
} from './canvasPanoramaExport.js'

assert.equal(isPanorama21x9(2520, 1080), true)
assert.equal(isPanorama21x9(3840, 1646), true)
assert.equal(isPanorama21x9(1920, 1080), false)
assert.equal(isPanorama21x9(0, 1080), false)
assert.equal(isPanoramaVrSupportedRatio(1920, 1080), true)
assert.equal(isPanoramaVrSupportedRatio(4096, 2048), true)
assert.equal(isPanoramaVrSupportedRatio(2520, 1080), true)
assert.equal(isPanoramaVrSupportedRatio(3840, 1080), true)
assert.equal(isPanoramaVrSupportedRatio(1440, 1440), false)
assert.equal(isPanoramaVrSupportedRatio(1600, 1200), false)

assert.deepEqual(getPanoramaRatioOption('9:16'), {
  id: '9:16',
  label: '9:16 (1080x1920)',
  width: 1080,
  height: 1920
})
assert.equal(getPanoramaRatioOption('missing'), null)

assert.deepEqual(
  getPresetPanoramaViews(4).map(view => [view.label, view.yaw, view.pitch]),
  [
    ['全景-前', 0, 0],
    ['全景-右', 90, 0],
    ['全景-后', 180, 0],
    ['全景-左', 270, 0]
  ]
)

const twelveViews = getPresetPanoramaViews(12)
assert.equal(twelveViews.length, 12)
assert.deepEqual(twelveViews.slice(0, 3).map(view => view.yaw), [0, 45, 90])
assert.deepEqual(twelveViews.slice(-4).map(view => view.pitch), [35, 35, -35, -35])

assert.equal(getPresetPanoramaViews(5).length, 0)
assert.equal(getProjectionCameraSettings('little-planet').pitchOffset, 70)
assert.equal(getProjectionCameraSettings('unknown').id, 'rectilinear')

console.log('canvasPanoramaExport tests passed')

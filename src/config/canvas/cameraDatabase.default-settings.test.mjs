import assert from 'node:assert/strict'
import { getDefaultCameraSettingsForType } from './cameraDatabase.js'

const cameraDefaults = getDefaultCameraSettingsForType('CAMERA')

assert.deepEqual(cameraDefaults, {
  cameraType: 'CAMERA',
  camera: 'nikon-f3',
  lens: '',
  focalLength: 35,
  aperture: 1.4,
  effects: []
})

const digitalDefaults = getDefaultCameraSettingsForType('DIGITAL')

assert.equal(digitalDefaults.cameraType, 'DIGITAL')
assert.equal(Boolean(digitalDefaults.camera), true)
assert.equal(Boolean(digitalDefaults.lens), true)
assert.equal(digitalDefaults.focalLength, 35)
assert.equal(digitalDefaults.aperture, 1.3)
assert.deepEqual(digitalDefaults.effects, [])

console.log('camera default settings tests passed')

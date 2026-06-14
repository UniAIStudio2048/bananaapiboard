import assert from 'node:assert/strict'
import {
  ensureDirectorPos3d,
  legacyDirectorTo3D,
  readDirectorUiAxis,
  writeDirectorUiAxis,
  pos3dToDirectorLegacy
} from './directorStudioCoordinates.js'

assert.deepEqual(legacyDirectorTo3D(260, 130), { x: 0, y: 0, z: 0 })
assert.deepEqual(pos3dToDirectorLegacy({ x: 0, y: 0, z: 0 }), { x: 260, y: 130 })

const pos = { x: 2, y: 3, z: 4 }
assert.equal(readDirectorUiAxis(pos, 'x'), 4)
assert.equal(readDirectorUiAxis(pos, 'y'), 2)
assert.equal(readDirectorUiAxis(pos, 'z'), 3)
assert.deepEqual(writeDirectorUiAxis(pos, 'x', 9), { x: 2, y: 3, z: 9 })
assert.deepEqual(writeDirectorUiAxis(pos, 'y', 8), { x: 8, y: 3, z: 4 })
assert.deepEqual(writeDirectorUiAxis(pos, 'z', 7), { x: 2, y: 7, z: 4 })

assert.deepEqual(ensureDirectorPos3d({ pos3d: { x: 1, y: 2, z: 3 }, x: 0, y: 0 }), { x: 1, y: 2, z: 3 })
assert.deepEqual(ensureDirectorPos3d({ x: 260, y: 130 }), { x: 0, y: 0, z: 0 })

console.log('directorStudioCoordinates tests passed')

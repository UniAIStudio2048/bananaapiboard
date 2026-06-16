import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  createDirectorMeshForItem,
  createDirectorPanoramaSphere,
  createDirectorSelectionRing,
  disposeDirectorObject3D,
  updateDirectorObjectTransform
} from './directorStudioMeshFactory.js'

function collectMeshes(object3d) {
  const meshes = []
  object3d.traverse(child => {
    if (child.isMesh) meshes.push(child)
  })
  return meshes
}

function firstColorHex(object3d) {
  const mesh = collectMeshes(object3d).find(child => child.material?.color)
  return mesh?.material.color.getHexString()
}

const cube = createDirectorMeshForItem({
  id: 'cube-1',
  presetId: 'cube',
  color: '#ff0000',
  pos3d: { x: 1, y: 2, z: 3 },
  rotation3d: { x: 0.1, y: 0.2, z: 0.3 },
  scale3d: { x: 1.2, y: 0.8, z: 1.5 }
})

assert.ok(cube instanceof THREE.Object3D)
assert.equal(cube.userData.itemId, 'cube-1')
assert.equal(firstColorHex(cube), 'ff0000')
assert.deepEqual(cube.position.toArray(), [1, 2, 3])
assert.deepEqual(cube.scale.toArray(), [1.2, 0.8, 1.5])
assert.equal(collectMeshes(cube).every(mesh => mesh.name === 'item:cube-1'), true)

updateDirectorObjectTransform(cube, {
  id: 'cube-1',
  x: 520,
  y: 260,
  rotation3d: { x: 0, y: Math.PI / 2, z: 0 },
  scale3d: { x: 2, y: 2, z: 2 }
})

assert.deepEqual(cube.position.toArray(), [5, 0, 3])
assert.equal(cube.rotation.y, Math.PI / 2)
assert.deepEqual(cube.scale.toArray(), [2, 2, 2])

const person = createDirectorMeshForItem({
  id: 'person-1',
  category: 'person',
  presetId: 'person-child-boy',
  color: '#60a5fa',
  bodyControls: { style: 'childlike', arms: { spreadDeg: 12 } },
  action: '伸手'
})

assert.equal(person.userData.itemId, 'person-1')
assert.equal(person.userData.directorStudioMeshType, 'person')
assert.ok(collectMeshes(person).length >= 10)
assert.ok(person.userData.bones?.rightShoulder)

const posedPerson = createDirectorMeshForItem({
  id: 'person-posed',
  category: 'person',
  presetId: 'person-adult-male-average',
  color: '#60a5fa',
  bodyControls: { showControls: true },
  boneControls: {
    rightShoulder: { xDeg: -90, yDeg: 12, zDeg: -18 },
    rightElbow: { xDeg: -55 },
    head: { yDeg: 22 }
  }
})

assert.equal(Math.round(THREE.MathUtils.radToDeg(posedPerson.userData.bones.rightShoulder.rotation.x)), -90)
assert.equal(Math.round(THREE.MathUtils.radToDeg(posedPerson.userData.bones.rightShoulder.rotation.y)), 12)
assert.equal(Math.round(THREE.MathUtils.radToDeg(posedPerson.userData.bones.rightShoulder.rotation.z)), -8)
assert.equal(Math.round(THREE.MathUtils.radToDeg(posedPerson.userData.bones.rightElbow.rotation.x)), -55)
assert.equal(Math.round(THREE.MathUtils.radToDeg(posedPerson.userData.bones.headGroup.rotation.y)), 22)
assert.match(posedPerson.userData.cacheKey, /rightShoulder/)

const ring = createDirectorSelectionRing({ id: 'cube-1', presetId: 'cube' })
assert.ok(ring.geometry instanceof THREE.RingGeometry)
assert.equal(ring.userData.itemId, 'cube-1')
assert.equal(ring.rotation.x, -Math.PI / 2)

const texture = new THREE.Texture()
const sphere = createDirectorPanoramaSphere(texture)
assert.ok(sphere.geometry instanceof THREE.SphereGeometry)
assert.equal(sphere.material.map, texture)
assert.equal(sphere.material.side, THREE.BackSide)

let geometryDisposed = false
let materialDisposed = false
const disposable = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: '#ffffff' })
)
disposable.geometry.dispose = () => { geometryDisposed = true }
disposable.material.dispose = () => { materialDisposed = true }
disposeDirectorObject3D(disposable)

assert.equal(geometryDisposed, true)
assert.equal(materialDisposed, true)

console.log('directorStudioMeshFactory tests passed')

import * as THREE from 'three'
import { ensureDirectorPos3d } from './directorStudioCoordinates.js'
import {
  normalizeDirectorStudioBodyControls,
  normalizeDirectorStudioBoneControls
} from '../config/canvas/directorStudioPresetCatalog.js'

const DEFAULT_ITEM_COLOR = '#38bdf8'
const DETAIL_MATERIAL_KEY = 'directorStudioDetailMaterial'
const PANORAMA_RADIUS = 50
const DIRECTOR_STUDIO_BONE_TARGETS = [
  ['head', 'headGroup'],
  ['torso', 'torsoMesh'],
  ['leftShoulder', 'leftShoulder'],
  ['leftElbow', 'leftElbow'],
  ['rightShoulder', 'rightShoulder'],
  ['rightElbow', 'rightElbow'],
  ['leftHip', 'leftHip'],
  ['leftKnee', 'leftKnee'],
  ['rightHip', 'rightHip'],
  ['rightKnee', 'rightKnee']
]

function normalizeColor(value, fallback = DEFAULT_ITEM_COLOR) {
  const color = typeof value === 'string' && value.trim() ? value.trim() : fallback
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color
  return fallback
}

function createMaterial(color, options = {}) {
  const normalized = normalizeColor(color)
  const material = new THREE.MeshStandardMaterial({
    color: normalized,
    emissive: normalized,
    emissiveIntensity: options.emissiveIntensity ?? 0.08,
    metalness: options.metalness ?? 0.04,
    roughness: options.roughness ?? 0.62,
    side: options.side ?? THREE.FrontSide
  })
  if (options.detail) material.userData[DETAIL_MATERIAL_KEY] = true
  return material
}

function createBasicMaterial(color, options = {}) {
  const material = new THREE.MeshBasicMaterial({
    color: normalizeColor(color),
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    depthTest: options.depthTest ?? true
  })
  if (options.detail) material.userData[DETAIL_MATERIAL_KEY] = true
  return material
}

function addMesh(group, geometry, material, options = {}) {
  const mesh = new THREE.Mesh(geometry, material)
  if (options.position) mesh.position.set(options.position[0], options.position[1], options.position[2])
  if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2])
  if (options.scale) mesh.scale.set(options.scale[0], options.scale[1], options.scale[2])
  group.add(mesh)
  return mesh
}

function addBox(group, material, size, position, options = {}) {
  return addMesh(group, new THREE.BoxGeometry(size[0], size[1], size[2]), material, {
    ...options,
    position
  })
}

function addCylinder(group, material, radiusTop, radiusBottom, height, position, segments = 16, options = {}) {
  return addMesh(group, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material, {
    ...options,
    position
  })
}

function addSphere(group, material, radius, position, options = {}) {
  return addMesh(group, new THREE.SphereGeometry(radius, 22, 16), material, {
    ...options,
    position
  })
}

function createWedgeGeometry(width = 1.4, height = 0.45, depth = 1) {
  const x0 = -width / 2
  const x1 = width / 2
  const z0 = -depth / 2
  const z1 = depth / 2
  const vertices = new Float32Array([
    x0, 0, z0, x1, 0, z0, x1, height, z0,
    x0, 0, z1, x1, 0, z1, x1, height, z1
  ])
  const indices = [
    0, 1, 2,
    3, 5, 4,
    0, 3, 4, 0, 4, 1,
    0, 2, 5, 0, 5, 3,
    1, 4, 5, 1, 5, 2
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function normalizeRotation3d(item) {
  return {
    x: Number.isFinite(item?.rotation3d?.x) ? item.rotation3d.x : 0,
    y: Number.isFinite(item?.rotation3d?.y) ? item.rotation3d.y : 0,
    z: Number.isFinite(item?.rotation3d?.z) ? item.rotation3d.z : 0
  }
}

function normalizeScale3d(item) {
  if (Number.isFinite(item?.scale)) {
    const scalar = THREE.MathUtils.clamp(item.scale, 0.05, 10)
    return { x: scalar, y: scalar, z: scalar }
  }
  return {
    x: THREE.MathUtils.clamp(Number.isFinite(item?.scale3d?.x) ? item.scale3d.x : 1, 0.05, 10),
    y: THREE.MathUtils.clamp(Number.isFinite(item?.scale3d?.y) ? item.scale3d.y : 1, 0.05, 10),
    z: THREE.MathUtils.clamp(Number.isFinite(item?.scale3d?.z) ? item.scale3d.z : 1, 0.05, 10)
  }
}

function inferBodyStyle(presetId, controls) {
  const explicitStyle = typeof controls?.style === 'string' ? controls.style : ''
  if (explicitStyle && explicitStyle !== 'preset') return explicitStyle
  const id = typeof presetId === 'string' ? presetId.toLowerCase() : ''
  if (id.includes('child')) return 'childlike'
  if (id.includes('slim')) return 'slim'
  if (id.includes('strong')) return 'strong'
  if (id.includes('heavy')) return 'heavy'
  return explicitStyle || 'preset'
}

function isPersonItem(item) {
  const category = typeof item?.category === 'string' ? item.category.toLowerCase() : ''
  const presetId = typeof item?.presetId === 'string' ? item.presetId.toLowerCase() : ''
  const visualId = typeof item?.visualId === 'string' ? item.visualId.toLowerCase() : ''
  return category === 'person' ||
    presetId.startsWith('person-') ||
    visualId.startsWith('person-') ||
    ['man', 'woman', 'child', 'elder', 'tallman', 'shortman', 'heavyman', 'slimwoman', 'tallwoman', 'male', 'female'].includes(presetId)
}

function getObjectHeight(item) {
  const presetId = typeof item?.presetId === 'string' ? item.presetId : ''
  if (presetId.startsWith('scene-')) return 1.2
  if (presetId.startsWith('vehicle-')) return 1
  if (['door', 'window', 'bookshelf', 'cabinet'].includes(presetId)) return 1.45
  if (['floor-lamp', 'bed'].includes(presetId)) return 1.2
  if (['table', 'desk', 'chair', 'office-chair', 'sofa'].includes(presetId)) return 0.9
  return 1
}

function getPersonControls(item) {
  const style = inferBodyStyle(item?.presetId, item?.bodyControls)
  return normalizeDirectorStudioBodyControls({ ...item?.bodyControls, style })
}

function createCapsule(radius, length, material) {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 8, 16),
    material
  )
}

function getDirectorStudioBoneTarget(bones, boneKey) {
  const targetKey = DIRECTOR_STUDIO_BONE_TARGETS.find(([key]) => key === boneKey)?.[1]
  return targetKey ? bones?.[targetKey] : null
}

function captureDirectorStudioBoneRestRotations(bones) {
  const rest = {}
  DIRECTOR_STUDIO_BONE_TARGETS.forEach(([boneKey]) => {
    const target = getDirectorStudioBoneTarget(bones, boneKey)
    if (target) {
      rest[boneKey] = {
        x: target.rotation.x,
        y: target.rotation.y,
        z: target.rotation.z
      }
    }
  })
  return rest
}

function restoreDirectorStudioBoneRestRotations(bones, restRotations) {
  if (!bones || !restRotations) return false
  let restored = false
  DIRECTOR_STUDIO_BONE_TARGETS.forEach(([boneKey]) => {
    const target = getDirectorStudioBoneTarget(bones, boneKey)
    const rest = restRotations[boneKey]
    if (target && rest) {
      target.rotation.set(rest.x || 0, rest.y || 0, rest.z || 0)
      restored = true
    }
  })
  return restored
}

function createDirectorPersonMesh(item, color) {
  const controls = getPersonControls(item)
  const presetId = typeof item?.presetId === 'string' ? item.presetId.toLowerCase() : ''
  const isFemale = presetId.includes('female') || presetId.includes('woman') || presetId.includes('girl') || presetId === 'female'
  const isElder = presetId.includes('elder') || presetId === 'elder'
  const isHeavy = controls.style === 'heavy' || presetId.includes('heavy')
  const height = 1.75 * controls.core.height * (isElder ? 0.94 : 1)
  const legH = height * 0.45 * controls.legs.length
  const torsoH = height * 0.31
  const torsoR = height * 0.105 * controls.core.torsoWidth
  const headR = height * 0.115 * controls.core.headScale
  const armH = height * 0.37 * controls.arms.length
  const legR = height * 0.035 * controls.legs.thickness
  const armR = height * 0.03 * controls.arms.thickness
  const shoulderX = Math.max(torsoR * 1.15, height * 0.095 * controls.core.torsoWidth)
  const hipX = Math.max(torsoR * 0.72, height * 0.058 * controls.core.torsoWidth)
  const body = new THREE.Group()
  const material = createMaterial(color, { roughness: 0.66, emissiveIntensity: 0.11 })
  const dark = createMaterial('#111827', { detail: true, roughness: 0.75, emissiveIntensity: 0.02 })
  const hair = createMaterial(isFemale ? '#3f1d2f' : '#1f2937', { detail: true, roughness: 0.72, emissiveIntensity: 0.02 })
  const marker = createBasicMaterial('#facc15', { detail: true, transparent: true, opacity: 0.9, depthTest: false })

  const hipY = legH
  const torsoCenterY = hipY + torsoH / 2
  const shoulderY = hipY + torsoH - torsoR * 0.35
  const neckY = hipY + torsoH + height * 0.025
  const headY = neckY + headR
  const armSpread = THREE.MathUtils.degToRad(controls.arms.spreadDeg) + 0.18
  const legSpread = THREE.MathUtils.degToRad(controls.legs.spreadDeg) + 0.04

  const torsoGroup = new THREE.Group()
  torsoGroup.position.y = torsoCenterY
  torsoGroup.rotation.x = THREE.MathUtils.degToRad(controls.core.torsoLeanDeg + (isElder ? -7 : 0))
  torsoGroup.add(createCapsule(torsoR, torsoH, material))
  if (isHeavy) {
    const belly = new THREE.Mesh(new THREE.SphereGeometry(torsoR * 0.92, 20, 14), material)
    belly.position.set(0, -torsoH * 0.12, torsoR * 0.42)
    belly.scale.set(1.1, 0.88, 0.78)
    torsoGroup.add(belly)
  }
  body.add(torsoGroup)

  const neck = addCylinder(body, material, torsoR * 0.25, torsoR * 0.28, height * 0.08, [0, neckY, 0], 12)
  neck.rotation.x = torsoGroup.rotation.x * 0.5

  const headGroup = new THREE.Group()
  headGroup.position.set(0, headY, 0)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(headR, 28, 22), material)
  skull.scale.y = 1.06
  headGroup.add(skull)
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(headR * 1.02, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hair
  )
  hairCap.position.z = -headR * 0.04
  hairCap.scale.y = 1.08
  headGroup.add(hairCap)
  if (isFemale) {
    const backHair = createCapsule(headR * 0.32, headR * 0.82, hair)
    backHair.position.set(0, -headR * 0.48, -headR * 0.34)
    backHair.scale.set(1.2, 1, 0.42)
    headGroup.add(backHair)
  }
  if (isElder) headGroup.rotation.x = 0.18
  body.add(headGroup)

  function makeArm(side) {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * shoulderX, shoulderY, 0)
    shoulder.rotation.z = side * armSpread
    shoulder.add(new THREE.Mesh(new THREE.SphereGeometry(armR * 1.05, 12, 10), material))
    const upperLen = armH * 0.52
    const foreLen = armH * 0.48
    const upper = createCapsule(armR, upperLen, material)
    upper.position.y = -upperLen / 2
    shoulder.add(upper)
    const elbow = new THREE.Group()
    elbow.position.y = -upperLen
    elbow.add(new THREE.Mesh(new THREE.SphereGeometry(armR, 12, 10), material))
    const fore = createCapsule(armR * 0.9, foreLen, material)
    fore.position.y = -foreLen / 2
    elbow.add(fore)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(armR * 1.35, 14, 10), material)
    hand.position.set(side * armR * 0.6, -foreLen, 0)
    elbow.add(hand)
    shoulder.add(elbow)
    body.add(shoulder)
    return { shoulder, elbow }
  }

  function makeLeg(side) {
    const hip = new THREE.Group()
    hip.position.set(side * hipX, hipY, 0)
    hip.rotation.z = side * legSpread
    hip.add(new THREE.Mesh(new THREE.SphereGeometry(legR * 1.05, 12, 10), material))
    const thighLen = legH * 0.52
    const shinLen = legH * 0.46
    const thigh = createCapsule(legR, thighLen, material)
    thigh.position.y = -thighLen / 2
    hip.add(thigh)
    const knee = new THREE.Group()
    knee.position.y = -thighLen
    knee.add(new THREE.Mesh(new THREE.SphereGeometry(legR, 12, 10), material))
    const shin = createCapsule(legR * 0.9, shinLen, material)
    shin.position.y = -shinLen / 2
    knee.add(shin)
    const foot = addBox(knee, dark, [legR * 2.2, legR * 0.8, legR * 4.0], [0, -shinLen - legR * 0.25, legR * 1.25])
    foot.rotation.x = -0.04
    hip.add(knee)
    body.add(hip)
    return { hip, knee }
  }

  const leftArm = makeArm(-1)
  const rightArm = makeArm(1)
  const leftLeg = makeLeg(-1)
  const rightLeg = makeLeg(1)

  if (controls.showControls) {
    ;[
      ['leftShoulder', leftArm.shoulder],
      ['rightShoulder', rightArm.shoulder],
      ['leftElbow', leftArm.elbow],
      ['rightElbow', rightArm.elbow],
      ['leftHip', leftLeg.hip],
      ['rightHip', rightLeg.hip],
      ['leftKnee', leftLeg.knee],
      ['rightKnee', rightLeg.knee],
      ['head', headGroup],
      ['torso', torsoGroup]
    ].forEach(([boneKey, target], index) => {
      target.userData.directorStudioBoneKey = boneKey
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.055), marker)
      block.renderOrder = 900 + index
      block.userData.directorStudioBoneHandle = true
      block.userData.boneKey = boneKey
      target.add(block)
    })
  }

  body.userData.directorStudioMeshType = 'person'
  body.userData.bones = {
    leftShoulder: leftArm.shoulder,
    rightShoulder: rightArm.shoulder,
    leftElbow: leftArm.elbow,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    rightHip: rightLeg.hip,
    leftKnee: leftLeg.knee,
    rightKnee: rightLeg.knee,
    headGroup,
    torsoMesh: torsoGroup,
    constants: { legH, armH, height }
  }
  applyPersonActionPose(body, item?.action)
  body.userData.directorStudioBoneRestRotations = captureDirectorStudioBoneRestRotations(body.userData.bones)
  applyDirectorStudioBoneControls(body, item?.boneControls)
  return body
}

function applyPersonActionPose(body, action) {
  const bones = body.userData.bones
  if (!bones || !action) return
  const text = String(action).toLowerCase()
  if (text.includes('坐') || text.includes('sit')) {
    bones.leftHip.rotation.x -= Math.PI / 2
    bones.rightHip.rotation.x -= Math.PI / 2
    bones.leftKnee.rotation.x += Math.PI / 2
    bones.rightKnee.rotation.x += Math.PI / 2
    bones.leftShoulder.rotation.x -= 0.35
    bones.rightShoulder.rotation.x -= 0.35
    bones.leftElbow.rotation.x -= 0.45
    bones.rightElbow.rotation.x -= 0.45
    body.position.y = -bones.constants.legH * 0.48
  } else if (text.includes('蹲') || text.includes('squat') || text.includes('crouch')) {
    bones.leftHip.rotation.x -= 1.55
    bones.rightHip.rotation.x -= 1.55
    bones.leftKnee.rotation.x += 1.55
    bones.rightKnee.rotation.x += 1.55
    bones.torsoMesh.rotation.x -= 0.28
    bones.leftShoulder.rotation.x -= 0.45
    bones.rightShoulder.rotation.x -= 0.45
    body.position.y = -bones.constants.legH * 0.62
  } else if (text.includes('跑') || text.includes('run')) {
    bones.leftHip.rotation.x -= 0.95
    bones.rightHip.rotation.x += 0.55
    bones.leftKnee.rotation.x += 1.25
    bones.rightKnee.rotation.x += 0.22
    bones.rightShoulder.rotation.x -= 0.8
    bones.rightElbow.rotation.x -= 0.75
    bones.leftShoulder.rotation.x += 0.6
    bones.leftElbow.rotation.x -= 0.55
    bones.torsoMesh.rotation.x -= 0.2
  } else if (text.includes('走') || text.includes('walk')) {
    bones.leftHip.rotation.x -= 0.5
    bones.rightHip.rotation.x += 0.28
    bones.leftKnee.rotation.x += 0.42
    bones.rightShoulder.rotation.x -= 0.4
    bones.leftShoulder.rotation.x += 0.35
  } else if (text.includes('伸手') || text.includes('指向') || text.includes('point') || text.includes('reach')) {
    bones.rightShoulder.rotation.x -= Math.PI / 2
    bones.rightElbow.rotation.x -= 0.12
    bones.headGroup.rotation.y += 0.12
  } else if (text.includes('对话') || text.includes('talk') || text.includes('speak')) {
    bones.rightShoulder.rotation.x -= 0.5
    bones.rightShoulder.rotation.z -= 0.18
    bones.rightElbow.rotation.x -= 1.15
    bones.headGroup.rotation.y += 0.25
  } else if (text.includes('观察') || text.includes('look')) {
    bones.rightShoulder.rotation.x -= 1.35
    bones.rightElbow.rotation.x -= 0.45
    bones.headGroup.rotation.x -= 0.16
  } else if (text.includes('回头') || text.includes('turn')) {
    bones.headGroup.rotation.y += Math.PI * 0.55
    bones.torsoMesh.rotation.y += Math.PI * 0.18
  } else if (text.includes('跳') || text.includes('jump')) {
    body.position.y = 0.38
    bones.leftHip.rotation.x -= 0.45
    bones.rightHip.rotation.x -= 0.45
    bones.leftKnee.rotation.x += 0.95
    bones.rightKnee.rotation.x += 0.95
    bones.leftShoulder.rotation.x -= 2.25
    bones.rightShoulder.rotation.x -= 2.25
  } else if (text.includes('躺') || text.includes('lie')) {
    body.rotation.x = -Math.PI / 2
    body.position.y = 0.25
  }
  body.userData.poseYOffset = body.position.y
}

function applyBoneRotation(target, controls) {
  if (!target || !controls) return
  target.rotation.x += THREE.MathUtils.degToRad(controls.xDeg || 0)
  target.rotation.y += THREE.MathUtils.degToRad(controls.yDeg || 0)
  target.rotation.z += THREE.MathUtils.degToRad(controls.zDeg || 0)
}

function applyDirectorStudioBoneControls(body, controls) {
  const bones = body.userData.bones
  if (!bones) return
  const normalized = normalizeDirectorStudioBoneControls(controls)
  applyBoneRotation(bones.headGroup, normalized.head)
  applyBoneRotation(bones.torsoMesh, normalized.torso)
  applyBoneRotation(bones.leftShoulder, normalized.leftShoulder)
  applyBoneRotation(bones.leftElbow, normalized.leftElbow)
  applyBoneRotation(bones.rightShoulder, normalized.rightShoulder)
  applyBoneRotation(bones.rightElbow, normalized.rightElbow)
  applyBoneRotation(bones.leftHip, normalized.leftHip)
  applyBoneRotation(bones.leftKnee, normalized.leftKnee)
  applyBoneRotation(bones.rightHip, normalized.rightHip)
  applyBoneRotation(bones.rightKnee, normalized.rightKnee)
}

function createBasicShapeMesh(presetId, material, height) {
  const group = new THREE.Group()
  switch (presetId) {
    case 'sphere':
      addSphere(group, material, height * 0.5, [0, height * 0.5, 0])
      break
    case 'cylinder':
      addCylinder(group, material, height * 0.42, height * 0.42, height, [0, height / 2, 0], 28)
      break
    case 'cone':
      addMesh(group, new THREE.ConeGeometry(height * 0.5, height, 28), material, { position: [0, height / 2, 0] })
      break
    case 'torus':
      addMesh(group, new THREE.TorusGeometry(height * 0.38, height * 0.12, 14, 36), material, {
        position: [0, height * 0.55, 0],
        rotation: [Math.PI / 2, 0, 0]
      })
      break
    case 'plane':
      addBox(group, material, [1.45, 0.04, 1], [0, 0.02, 0])
      break
    case 'disc':
      addCylinder(group, material, 0.62, 0.62, 0.06, [0, 0.03, 0], 40)
      break
    case 'ramp':
      addMesh(group, createWedgeGeometry(1.4, 0.48, 1), material)
      break
    case 'pipe': {
      const pipe = addMesh(group, new THREE.CylinderGeometry(0.32, 0.32, 1.55, 32, 1, true), material, {
        position: [0, 0.44, 0],
        rotation: [0, 0, Math.PI / 2]
      })
      pipe.material.side = THREE.DoubleSide
      break
    }
    case 'terrain': {
      addBox(group, material, [2.4, 0.12, 1.8], [0, 0.06, 0])
      addMesh(group, new THREE.SphereGeometry(0.45, 20, 12), material, {
        position: [0.35, 0.22, -0.1],
        scale: [1.7, 0.32, 1.1]
      })
      addMesh(group, new THREE.SphereGeometry(0.24, 16, 10), material, {
        position: [-0.55, 0.16, 0.4],
        scale: [1.2, 0.25, 0.9]
      })
      break
    }
    case 'cube':
    default:
      addBox(group, material, [height, height, height], [0, height / 2, 0])
      break
  }
  return group
}

function addTable(group, material, height, isDesk = false) {
  const detail = createMaterial('#78350f', { detail: true, roughness: 0.76 })
  const topW = isDesk ? 1.45 : 1.35
  const topD = isDesk ? 0.72 : 0.82
  addBox(group, material, [topW, 0.08, topD], [0, height, 0])
  ;[[-0.42, -0.34], [0.42, -0.34], [-0.42, 0.34], [0.42, 0.34]].forEach(([x, z]) => {
    addCylinder(group, material, 0.04, 0.04, height, [x * topW, height / 2, z * topD], 10)
  })
  if (isDesk) {
    addBox(group, detail, [0.34, 0.3, 0.5], [0.42, height * 0.72, 0])
    addBox(group, createMaterial('#0f172a', { detail: true }), [0.62, 0.035, 0.44], [-0.24, height + 0.04, 0.02])
  }
}

function addChair(group, material, height, office = false) {
  const cushion = createMaterial('#f8fafc', { detail: true, roughness: 0.8 })
  addBox(group, material, [0.5, 0.07, 0.5], [0, height * 0.55, 0])
  addBox(group, cushion, [0.42, 0.04, 0.42], [0, height * 0.61, 0.02])
  addBox(group, material, [0.5, height * 0.5, 0.07], [0, height * 0.82, -0.22])
  if (office) {
    const metal = createMaterial('#64748b', { detail: true, metalness: 0.22, roughness: 0.44 })
    addCylinder(group, metal, 0.04, 0.04, height * 0.5, [0, height * 0.29, 0], 10)
    ;[[0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]].forEach(([x, z]) => {
      const spoke = addCylinder(group, metal, 0.018, 0.018, 0.56, [x / 2, 0.05, z / 2], 8)
      spoke.rotation.z = z === 0 ? Math.PI / 2 : 0
      spoke.rotation.x = x === 0 ? Math.PI / 2 : 0
    })
    addBox(group, metal, [0.72, 0.035, 0.045], [0, height * 0.73, 0.16])
  } else {
    ;[[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]].forEach(([x, z]) => {
      addCylinder(group, material, 0.035, 0.035, height * 0.55, [x, height * 0.275, z], 8)
    })
  }
}

function addCarLike(group, material, options = {}) {
  const length = options.length ?? 1.9
  const bodyH = options.bodyH ?? 0.52
  const roofW = options.roofW ?? 1
  const dark = createMaterial('#0f172a', { detail: true, roughness: 0.7, emissiveIntensity: 0.02 })
  const glass = createMaterial('#bae6fd', { detail: true, roughness: 0.3, emissiveIntensity: 0.04 })
  const light = createMaterial('#fef9c3', { detail: true, emissiveIntensity: 0.12 })
  const red = createMaterial('#ef4444', { detail: true, emissiveIntensity: 0.08 })
  addBox(group, material, [length, bodyH, 0.92], [0, 0.36, 0])
  addBox(group, material, [roofW, 0.38, 0.82], [-0.12, 0.36 + bodyH / 2 + 0.17, 0])
  addBox(group, glass, [roofW * 0.72, 0.16, 0.05], [-0.12, 0.72, 0.43])
  addBox(group, glass, [roofW * 0.72, 0.16, 0.05], [-0.12, 0.72, -0.43])
  addBox(group, light, [0.055, 0.08, 0.22], [length / 2 + 0.01, 0.38, 0.3])
  addBox(group, light, [0.055, 0.08, 0.22], [length / 2 + 0.01, 0.38, -0.3])
  addBox(group, red, [0.055, 0.08, 0.22], [-length / 2 - 0.01, 0.38, 0.3])
  addBox(group, red, [0.055, 0.08, 0.22], [-length / 2 - 0.01, 0.38, -0.3])
  ;[-0.33, 0.33].forEach(x => {
    ;[-0.48, 0.48].forEach(z => {
      const wheel = addCylinder(group, dark, 0.22, 0.22, 0.16, [x * length, 0.22, z], 18)
      wheel.rotation.x = Math.PI / 2
    })
  })
  if (options.taxi) addBox(group, createMaterial('#fef3c7', { detail: true }), [0.32, 0.09, 0.22], [-0.1, 0.94, 0])
  if (options.emergency) addBox(group, options.emergency === 'police' ? red : createMaterial('#38bdf8', { detail: true }), [0.42, 0.08, 0.2], [-0.08, 0.98, 0])
}

function createPropMesh(presetId, material, height) {
  const group = new THREE.Group()
  const detail = createMaterial('#1e293b', { detail: true, roughness: 0.72, emissiveIntensity: 0.02 })
  switch (presetId) {
    case 'table':
      addTable(group, material, height)
      break
    case 'desk':
      addTable(group, material, height, true)
      break
    case 'chair':
      addChair(group, material, height)
      break
    case 'office-chair':
      addChair(group, material, height, true)
      break
    case 'stool':
      addCylinder(group, material, 0.32, 0.36, height * 0.52, [0, height * 0.26, 0], 22)
      addCylinder(group, createMaterial('#f8fafc', { detail: true }), 0.28, 0.3, 0.04, [0, height * 0.55, 0], 22)
      break
    case 'sofa':
      addBox(group, material, [1.35, 0.34, 0.62], [0, 0.24, 0.05])
      addBox(group, material, [1.42, 0.44, 0.12], [0, 0.48, -0.25])
      addBox(group, material, [0.16, 0.38, 0.66], [-0.76, 0.32, 0.05])
      addBox(group, material, [0.16, 0.38, 0.66], [0.76, 0.32, 0.05])
      break
    case 'bed':
      addBox(group, material, [1.55, 0.22, 0.92], [0.1, 0.22, 0])
      addBox(group, detail, [0.14, 0.72, 0.98], [-0.74, 0.44, 0])
      addBox(group, createMaterial('#f8fafc', { detail: true }), [0.46, 0.09, 0.34], [-0.42, 0.38, 0])
      break
    case 'cabinet':
    case 'bookshelf':
      addBox(group, material, [0.9, height * 1.25, 0.38], [0, height * 0.62, 0])
      ;[-0.32, -0.06, 0.2, 0.45].forEach(y => addBox(group, detail, [0.84, 0.03, 0.4], [0, height * 0.62 + y, 0.02]))
      if (presetId === 'bookshelf') {
        ;[-0.28, -0.08, 0.12, 0.32].forEach((x, index) => {
          addBox(group, createMaterial(index % 2 === 0 ? '#60a5fa' : '#f97316', { detail: true }), [0.1, 0.24, 0.08], [x, height * 0.78, 0.22])
        })
      }
      break
    case 'door':
      addBox(group, material, [0.68, 1.8, 0.08], [0, 0.9, 0])
      addBox(group, detail, [0.54, 0.03, 0.035], [0, 1.28, 0.06])
      addBox(group, detail, [0.03, 1.5, 0.035], [-0.26, 0.9, 0.06])
      addBox(group, detail, [0.03, 1.5, 0.035], [0.26, 0.9, 0.06])
      addSphere(group, createMaterial('#facc15', { detail: true }), 0.035, [0.22, 0.86, 0.06])
      break
    case 'window':
      addBox(group, createMaterial('#bae6fd', { detail: true, roughness: 0.3, emissiveIntensity: 0.04 }), [1.05, 0.7, 0.06], [0, 0.85, 0])
      addBox(group, detail, [1.12, 0.06, 0.08], [0, 1.2, 0.02])
      addBox(group, detail, [1.12, 0.06, 0.08], [0, 0.5, 0.02])
      addBox(group, detail, [0.06, 0.72, 0.08], [0, 0.85, 0.02])
      addBox(group, detail, [1.08, 0.035, 0.085], [0, 0.85, 0.04])
      break
    case 'floor-lamp':
    case 'table-lamp':
    case 'lamp': {
      const stemH = presetId === 'table-lamp' ? 0.58 : 1.22
      const shadeY = presetId === 'table-lamp' ? 0.72 : 1.35
      addCylinder(group, detail, 0.025, 0.025, stemH, [0, stemH / 2, 0], 10)
      addCylinder(group, detail, 0.22, 0.22, 0.045, [0, 0.025, 0], 18)
      const shade = addMesh(group, new THREE.ConeGeometry(0.28, 0.34, 20, 1, true), material, { position: [0, shadeY, 0] })
      shade.rotation.x = Math.PI
      addCylinder(group, createMaterial('#fef3c7', { detail: true, emissiveIntensity: 0.12 }), 0.12, 0.12, 0.08, [0, shadeY - 0.12, 0], 14)
      break
    }
    case 'plant': {
      const leaf = createMaterial('#22c55e', { detail: true, roughness: 0.72 })
      addCylinder(group, createMaterial('#166534', { detail: true }), 0.05, 0.07, height * 0.5, [0, height * 0.25, 0], 8)
      addSphere(group, leaf, height * 0.32, [0, height * 0.7, 0])
      addCylinder(group, createMaterial('#7c2d12', { detail: true }), 0.22, 0.18, 0.18, [0, 0.09, 0], 14)
      break
    }
    case 'laptop':
      addBox(group, createMaterial('#64748b', { detail: true, metalness: 0.22 }), [0.72, 0.035, 0.46], [0, 0.12, 0.12])
      addBox(group, createMaterial('#0f172a', { detail: true }), [0.72, 0.46, 0.04], [0, 0.38, -0.12])
      break
    case 'phone':
      addBox(group, createMaterial('#0f172a', { detail: true }), [0.26, 0.04, 0.5], [0, 0.06, 0])
      addBox(group, createMaterial('#334155', { detail: true }), [0.2, 0.02, 0.38], [0, 0.09, 0])
      break
    case 'cup': {
      const cup = addMesh(group, new THREE.CylinderGeometry(0.18, 0.14, 0.32, 18, 1, true), material, { position: [0, 0.18, 0] })
      cup.material.side = THREE.DoubleSide
      const handle = addMesh(group, new THREE.TorusGeometry(0.13, 0.018, 8, 18, Math.PI * 1.35), material, { position: [0.18, 0.2, 0] })
      handle.rotation.y = Math.PI / 2
      break
    }
    case 'suitcase':
      addBox(group, material, [0.62, 0.78, 0.28], [0, 0.42, 0])
      addCylinder(group, detail, 0.025, 0.025, 0.44, [0, 0.86, 0], 8).rotation.z = Math.PI / 2
      break
    case 'monitor-tv':
      addBox(group, createMaterial('#0f172a', { detail: true }), [1, 0.58, 0.07], [0, 0.72, 0])
      addCylinder(group, detail, 0.035, 0.035, 0.38, [0, 0.31, 0], 10)
      addBox(group, detail, [0.46, 0.05, 0.28], [0, 0.08, 0])
      break
    case 'car':
      addCarLike(group, material, { length: 2.1, roofW: 1.18 })
      break
    default:
      return createBasicShapeMesh(presetId, material, height)
  }
  return group
}

function createSceneMesh(presetId, material) {
  const group = new THREE.Group()
  const id = presetId.slice('scene-'.length)
  const detail = createMaterial('#1e293b', { detail: true, roughness: 0.76, emissiveIntensity: 0.02 })
  const glass = createMaterial('#bae6fd', { detail: true, roughness: 0.28, emissiveIntensity: 0.04 })
  const wood = createMaterial('#78350f', { detail: true, roughness: 0.78 })
  const green = createMaterial('#22c55e', { detail: true, roughness: 0.7 })
  const asphalt = createMaterial('#475569', { detail: true, roughness: 0.84 })

  function addRoomShell() {
    addBox(group, material, [2.5, 0.08, 1.85], [0, 0.04, 0])
    addBox(group, material, [2.5, 1.05, 0.08], [0, 0.56, -0.9])
    addBox(group, material, [0.08, 1, 1.8], [-1.25, 0.54, 0])
    addBox(group, detail, [2.45, 0.035, 0.05], [0, 0.34, -0.84])
  }

  if (['living-room', 'kitchen', 'bedroom', 'office', 'classroom', 'hospital-room', 'shop-cafe', 'restaurant'].includes(id)) {
    addRoomShell()
    if (id === 'bedroom' || id === 'hospital-room') {
      addBox(group, material, [1.12, 0.18, 0.72], [-0.2, 0.22, 0.28])
      addBox(group, createMaterial('#f8fafc', { detail: true }), [0.36, 0.08, 0.28], [-0.55, 0.36, 0.28])
    } else if (id === 'office' || id === 'classroom') {
      addTable(group, wood, 0.42, true)
      addBox(group, id === 'classroom' ? createMaterial('#064e3b', { detail: true }) : detail, [1.15, 0.48, 0.05], [0.05, 0.65, -0.86])
    } else if (id === 'kitchen') {
      addBox(group, createMaterial('#f8fafc', { detail: true }), [1.55, 0.34, 0.38], [-0.15, 0.25, -0.62])
      addBox(group, detail, [0.42, 0.86, 0.36], [0.82, 0.48, -0.62])
    } else {
      addBox(group, material, [0.95, 0.28, 0.42], [-0.25, 0.22, 0.35])
      addTable(group, wood, 0.38)
    }
    addBox(group, glass, [0.32, 0.24, 0.035], [-0.56, 0.72, -0.84])
    addBox(group, glass, [0.32, 0.24, 0.035], [-0.18, 0.72, -0.84])
    return group
  }

  if (id === 'street-corner' || id === 'parking-lot') {
    addBox(group, asphalt, [2.8, 0.05, 1.95], [0, 0.025, 0])
    addBox(group, createMaterial('#f8fafc', { detail: true }), [0.08, 0.012, 1.2], [0.15, 0.07, 0])
    addBox(group, createMaterial('#f8fafc', { detail: true }), [0.08, 0.012, 1.2], [0.38, 0.07, 0])
    if (id === 'street-corner') {
      addCylinder(group, detail, 0.025, 0.025, 0.92, [0.9, 0.48, -0.55], 8)
      addBox(group, createMaterial('#facc15', { detail: true }), [0.16, 0.1, 0.1], [0.9, 0.95, -0.55])
    } else {
      addCarLike(group, material, { length: 1.6, roofW: 0.8 })
    }
    return group
  }

  if (id === 'park-path') {
    addBox(group, createMaterial('#166534', { detail: true }), [2.6, 0.05, 1.9], [0, 0.025, 0])
    addBox(group, material, [0.62, 0.06, 1.9], [0.08, 0.07, 0])
    ;[-0.72, 0.86].forEach(x => {
      addCylinder(group, wood, 0.04, 0.05, 0.46, [x, 0.25, -0.42], 8)
      addSphere(group, green, 0.24, [x, 0.58, -0.42])
    })
    return group
  }

  if (id === 'warehouse') {
    addBox(group, material, [2.5, 0.08, 1.75], [0, 0.04, 0])
    addBox(group, material, [2.35, 1.2, 0.08], [0, 0.64, -0.86])
    ;[-0.62, 0.18, 0.78].forEach(x => addBox(group, wood, [0.46, 0.3, 0.4], [x, 0.19, 0.24]))
    return group
  }

  if (id === 'house-exterior' || id === 'apartment-exterior') {
    if (id === 'apartment-exterior') {
      addBox(group, material, [0.9, 1.8, 0.72], [0, 0.92, 0])
      ;[-0.24, 0, 0.24].forEach(x => {
        ;[0.45, 0.85, 1.25].forEach(y => addBox(group, glass, [0.12, 0.16, 0.03], [x, y, 0.38]))
      })
    } else {
      addBox(group, material, [1.1, 0.82, 0.82], [0, 0.45, 0])
      const roof = addMesh(group, new THREE.ConeGeometry(0.86, 0.42, 4), createMaterial('#b45309', { detail: true }), { position: [0, 1.08, 0] })
      roof.rotation.y = Math.PI / 4
      addBox(group, wood, [0.18, 0.38, 0.04], [0, 0.28, 0.43])
      addBox(group, glass, [0.2, 0.16, 0.04], [-0.3, 0.58, 0.43])
      addBox(group, glass, [0.2, 0.16, 0.04], [0.3, 0.58, 0.43])
    }
    return group
  }

  addRoomShell()
  addBox(group, material, [0.8, 0.65, 0.65], [0, 0.42, 0.1])
  return group
}

function createVehicleMesh(presetId, material) {
  const group = new THREE.Group()
  const id = presetId.slice('vehicle-'.length)
  if (id === 'bicycle' || id === 'motorcycle' || id === 'e-scooter') {
    const dark = createMaterial('#0f172a', { detail: true })
    ;[-0.45, 0.45].forEach(x => {
      const wheel = addCylinder(group, dark, id === 'bicycle' ? 0.26 : 0.23, id === 'bicycle' ? 0.26 : 0.23, 0.1, [x, 0.26, 0], 22)
      wheel.rotation.x = Math.PI / 2
    })
    addBox(group, material, [0.9, 0.08, 0.08], [0, id === 'e-scooter' ? 0.42 : 0.52, 0])
    addBox(group, material, [0.56, 0.055, 0.055], [-0.1, 0.36, 0])
    addBox(group, dark, [0.22, 0.06, 0.18], [-0.05, 0.7, 0])
    if (id === 'motorcycle') addBox(group, material, [0.42, 0.22, 0.26], [0.14, 0.48, 0])
    if (id === 'e-scooter') addCylinder(group, createMaterial('#94a3b8', { detail: true }), 0.025, 0.025, 0.66, [0.45, 0.74, 0], 8).rotation.z = -0.22
    return group
  }
  if (id === 'bus' || id === 'van') {
    const length = id === 'bus' ? 2.65 : 2.05
    addCarLike(group, material, { length, bodyH: 0.72, roofW: length * 0.72 })
    addBox(group, createMaterial('#bae6fd', { detail: true }), [length * 0.58, 0.2, 0.05], [-0.2, 0.78, 0.48])
    return group
  }
  if (id === 'truck') {
    addBox(group, material, [1.46, 0.8, 0.92], [-0.28, 0.54, 0])
    addBox(group, createMaterial('#94a3b8', { detail: true }), [0.74, 0.62, 0.88], [0.84, 0.48, 0])
    addCarLike(group, material, { length: 1.8, roofW: 0.64 })
    return group
  }
  if (id === 'subway-car') {
    addBox(group, material, [2.8, 0.72, 0.92], [0, 0.5, 0])
    ;[-0.82, -0.28, 0.28, 0.82].forEach(x => {
      addBox(group, createMaterial('#bae6fd', { detail: true }), [0.34, 0.18, 0.04], [x, 0.68, 0.48])
      addBox(group, createMaterial('#bae6fd', { detail: true }), [0.34, 0.18, 0.04], [x, 0.68, -0.48])
    })
    return group
  }
  addCarLike(group, material, {
    length: id === 'suv' || id === 'ambulance' ? 2.1 : 1.86,
    bodyH: id === 'suv' || id === 'ambulance' ? 0.64 : 0.54,
    roofW: id === 'suv' || id === 'ambulance' ? 1.18 : 1,
    taxi: id === 'taxi',
    emergency: id === 'ambulance' ? 'ambulance' : id === 'police-car' ? 'police' : null
  })
  return group
}

function createDirectorAssetForItem(item, color) {
  if (isPersonItem(item)) return createDirectorPersonMesh(item, color)

  const presetId = typeof item?.presetId === 'string' && item.presetId.trim()
    ? item.presetId.trim()
    : typeof item?.visualId === 'string' && item.visualId.trim()
      ? item.visualId.trim()
      : 'generic-object'
  const height = getObjectHeight(item)
  const material = createMaterial(color, { side: THREE.DoubleSide })

  if (presetId.startsWith('scene-')) return createSceneMesh(presetId, material)
  if (presetId.startsWith('vehicle-')) return createVehicleMesh(presetId, material)
  if (['cube', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'disc', 'ramp', 'pipe', 'terrain'].includes(presetId)) {
    return createBasicShapeMesh(presetId, material, height)
  }
  return createPropMesh(presetId, material, height)
}

function tagMeshes(object3d, itemId) {
  object3d.traverse(child => {
    if (child.isMesh) child.name = `item:${itemId}`
  })
}

export function createDirectorMeshForItem(item, options = {}) {
  const root = new THREE.Group()
  const itemId = item?.id != null ? String(item.id) : `director-item-${Date.now()}`
  const color = normalizeColor(options.color || item?.color)
  const asset = createDirectorAssetForItem(item, color)
  root.add(asset)
  root.userData.itemId = itemId
  root.userData.directorStudioMeshType = asset.userData.directorStudioMeshType || 'object'
  if (asset.userData.bones) root.userData.bones = asset.userData.bones
  if (asset.userData.directorStudioBoneRestRotations) root.userData.directorStudioBoneRestRotations = asset.userData.directorStudioBoneRestRotations
  if (asset.userData.poseYOffset) root.userData.poseYOffset = asset.userData.poseYOffset
  root.userData.cacheKey = [
    root.userData.directorStudioMeshType,
    item?.category || '',
    item?.presetId || '',
    item?.visualId || '',
    item?.action || '',
    color,
    JSON.stringify(item?.bodyControls || {}),
    JSON.stringify(item?.boneControls || {})
  ].join('|')
  tagMeshes(root, itemId)
  updateDirectorObjectTransform(root, item)
  return root
}

export function disposeDirectorObject3D(object3d) {
  if (!object3d) return
  object3d.traverse(child => {
    if (child.geometry?.dispose) child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : []
    materials.forEach(material => {
      for (const value of Object.values(material)) {
        if (value?.isTexture && value.dispose) value.dispose()
      }
      material.dispose?.()
    })
  })
}

export function updateDirectorObjectTransform(object3d, item) {
  if (!object3d) return
  const pos = ensureDirectorPos3d(item)
  const rotation = normalizeRotation3d(item)
  const scale = normalizeScale3d(item)
  object3d.position.set(pos.x, pos.y, pos.z)
  object3d.rotation.set(rotation.x, rotation.y, rotation.z)
  object3d.scale.set(scale.x, scale.y, scale.z)
  if (item?.id != null) object3d.userData.itemId = String(item.id)
}

export function updateDirectorObjectBoneControls(object3d, controls) {
  const bones = object3d?.userData?.bones
  const restRotations = object3d?.userData?.directorStudioBoneRestRotations
  if (!bones || !restoreDirectorStudioBoneRestRotations(bones, restRotations)) return false
  applyDirectorStudioBoneControls(object3d, controls)
  object3d.userData.boneControlsKey = JSON.stringify(normalizeDirectorStudioBoneControls(controls))
  return true
}

export function createDirectorSelectionRing(item) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 48),
    createBasicMaterial(item?.color || '#fbbf24', {
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false
    })
  )
  const pos = ensureDirectorPos3d(item)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(pos.x, 0.02, pos.z)
  ring.renderOrder = 800
  ring.userData.itemId = item?.id != null ? String(item.id) : null
  return ring
}

export function createDirectorPanoramaSphere(texture) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: texture || null,
    side: THREE.BackSide,
    fog: false
  })
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(PANORAMA_RADIUS, 64, 32), material)
  sphere.name = '__directorPanoramaSphere'
  sphere.userData.radius = PANORAMA_RADIUS
  return sphere
}

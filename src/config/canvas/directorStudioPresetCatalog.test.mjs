import assert from 'node:assert/strict'
import {
  DIRECTOR_STUDIO_ACTION_POSE_PRESETS,
  DIRECTOR_STUDIO_BONE_CONTROL_GROUPS,
  DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS,
  normalizeDirectorStudioBoneControls,
  resolveDirectorStudioActionPosePreset,
  resolveDirectorStudioInteractionPosePreset
} from './directorStudioPresetCatalog.js'

const bones = normalizeDirectorStudioBoneControls({
  rightShoulder: { xDeg: -120, yDeg: 18, zDeg: -12 },
  leftElbow: { xDeg: -45 },
  head: { yDeg: 200 },
  bad: { xDeg: 999 }
})

assert.equal(bones.rightShoulder.xDeg, -120)
assert.equal(bones.rightShoulder.yDeg, 18)
assert.equal(bones.rightShoulder.zDeg, -12)
assert.equal(bones.leftElbow.xDeg, -45)
assert.equal(bones.head.yDeg, 90)
assert.equal(Object.prototype.hasOwnProperty.call(bones, 'bad'), false)

assert.ok(DIRECTOR_STUDIO_BONE_CONTROL_GROUPS.some(group => group.key === 'rightShoulder'))
assert.ok(DIRECTOR_STUDIO_BONE_CONTROL_GROUPS.some(group => group.key === 'leftKnee'))

assert.ok(DIRECTOR_STUDIO_ACTION_POSE_PRESETS.some(preset => preset.id === 'wave'))
assert.ok(DIRECTOR_STUDIO_ACTION_POSE_PRESETS.some(preset => preset.id === 'point'))
assert.ok(resolveDirectorStudioActionPosePreset('wave')?.boneControls?.rightShoulder)

assert.ok(DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS.some(preset => preset.id === 'face-to-face-dialogue'))
assert.ok(DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS.some(preset => preset.id === 'handshake'))
assert.ok(DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS.some(preset => preset.id === 'pass-object'))
assert.ok(resolveDirectorStudioInteractionPosePreset('handshake')?.primary?.boneControls?.rightShoulder)
assert.ok(resolveDirectorStudioInteractionPosePreset('handshake')?.secondary?.boneControls?.rightShoulder)

console.log('directorStudioPresetCatalog tests passed')

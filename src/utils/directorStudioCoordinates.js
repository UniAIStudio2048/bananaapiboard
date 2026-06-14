export const DIRECTOR_LEGACY_2D_W = 520
export const DIRECTOR_LEGACY_2D_H = 260

export const DIRECTOR_AXIS_COLORS = {
  x: '#3b82f6',
  y: '#ef4444',
  z: '#10b981'
}

export function legacyDirectorTo3D(x, y) {
  return {
    x: (Number(x) / DIRECTOR_LEGACY_2D_W - 0.5) * 10,
    y: 0,
    z: (Number(y) / DIRECTOR_LEGACY_2D_H - 0.5) * 6
  }
}

export function pos3dToDirectorLegacy(pos3d) {
  return {
    x: ((pos3d.x / 10) + 0.5) * DIRECTOR_LEGACY_2D_W,
    y: ((pos3d.z / 6) + 0.5) * DIRECTOR_LEGACY_2D_H
  }
}

export function ensureDirectorPos3d(item) {
  if (item?.pos3d && Number.isFinite(item.pos3d.x) && Number.isFinite(item.pos3d.y) && Number.isFinite(item.pos3d.z)) {
    return { x: item.pos3d.x, y: item.pos3d.y, z: item.pos3d.z }
  }
  return legacyDirectorTo3D(item?.x ?? DIRECTOR_LEGACY_2D_W / 2, item?.y ?? DIRECTOR_LEGACY_2D_H / 2)
}

export function readDirectorUiAxis(pos3d, axis) {
  if (axis === 'x') return pos3d.z
  if (axis === 'y') return pos3d.x
  return pos3d.y
}

export function writeDirectorUiAxis(pos3d, axis, value) {
  if (axis === 'x') return { ...pos3d, z: value }
  if (axis === 'y') return { ...pos3d, x: value }
  return { ...pos3d, y: value }
}

import { t as translateUi } from '../i18n/index.js'
export const PANORAMA_RATIO_OPTIONS = [
  { id: '16:9', label: '16:9 (1920x1080)', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16 (1080x1920)', width: 1080, height: 1920 },
  { id: '3:2', label: '3:2 (1920x1280)', width: 1920, height: 1280 },
  { id: '2:3', label: '2:3 (1080x1620)', width: 1080, height: 1620 },
  { id: '4:3', label: '4:3 (1920x1440)', width: 1920, height: 1440 },
  { id: '3:4', label: '3:4 (1080x1440)', width: 1080, height: 1440 },
  { id: '1:1', label: '1:1 (1440x1440)', width: 1440, height: 1440 },
  { id: '21:9', label: '21:9 (2520x1080)', width: 2520, height: 1080 },
  { id: '32:9', label: '32:9 (3840x1080)', width: 3840, height: 1080 }
]

export const PROJECTION_OPTIONS = [
  { id: 'rectilinear', get label() { return translateUi('uiMessages.mbc6bf591e16d') } },
  { id: 'pannini', label: 'Pannini' },
  { id: 'stereographic', get label() { return translateUi('uiMessages.mb62e4a106b97') } },
  { id: 'little-planet', get label() { return translateUi('uiMessages.m68cf5e71c2b2') } }
]

const PROJECTION_CAMERA_SETTINGS = {
  rectilinear: { id: 'rectilinear', fov: 90, pitchOffset: 0, zoom: 1 },
  pannini: { id: 'pannini', fov: 82, pitchOffset: 0, zoom: 1.08 },
  stereographic: { id: 'stereographic', fov: 112, pitchOffset: 0, zoom: 0.92 },
  'little-planet': { id: 'little-planet', fov: 132, pitchOffset: 70, zoom: 0.84 }
}

export function isPanorama21x9(width, height, tolerance = 0.08) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false
  }
  return Math.abs(width / height - 21 / 9) <= tolerance
}

export function isPanoramaVrSupportedRatio(width, height, tolerance = 0.08) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false
  }
  const ratio = width / height
  return ratio >= 16 / 9 - tolerance
}

export function getPanoramaRatioOption(id) {
  return PANORAMA_RATIO_OPTIONS.find(option => option.id === id) || null
}

export function getProjectionCameraSettings(projectionId) {
  return PROJECTION_CAMERA_SETTINGS[projectionId] || PROJECTION_CAMERA_SETTINGS.rectilinear
}

export function getPresetPanoramaViews(count) {
  if (count === 4) {
    return [
      { get label() { return translateUi('uiMessages.m78f096aa7e7c') }, yaw: 0, pitch: 0 },
      { get label() { return translateUi('uiMessages.mc02bc65f4458') }, yaw: 90, pitch: 0 },
      { get label() { return translateUi('uiMessages.mc8af5f19e607') }, yaw: 180, pitch: 0 },
      { get label() { return translateUi('uiMessages.mde227c24b639') }, yaw: 270, pitch: 0 }
    ]
  }

  if (count === 12) {
    const horizontal = Array.from({ length: 8 }, (_, index) => ({
      get label() { return translateUi('uiMessages.m39b5c3473102', { value1: (index + 1) }) },
      yaw: index * 45,
      pitch: 0
    }))
    return [
      ...horizontal,
      { get label() { return translateUi('uiMessages.m956fe4f06dfb') }, yaw: 45, pitch: 35 },
      { get label() { return translateUi('uiMessages.m9da041ea6dc0') }, yaw: 225, pitch: 35 },
      { get label() { return translateUi('uiMessages.me11c8b7972c9') }, yaw: 135, pitch: -35 },
      { get label() { return translateUi('uiMessages.m1f2755146a3b') }, yaw: 315, pitch: -35 }
    ]
  }

  return []
}

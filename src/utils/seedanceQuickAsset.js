import { normalizeAssetReviewStatus } from './assetReviewStatus.js'

export const SEEDANCE_QUICK_ASSET_TTL_DAYS = 15
export const SEEDANCE_QUICK_ASSET_TTL_MS = SEEDANCE_QUICK_ASSET_TTL_DAYS * 24 * 60 * 60 * 1000

export function getSeedanceQuickAsset(data = {}, now = Date.now()) {
  const asset = data.seedanceQuickAsset || null
  if (!asset?.assetUri || !asset?.assetId) {
    return {
      reviewed: false,
      active: false,
      expired: false,
      assetUri: '',
      expiresAt: ''
    }
  }

  const expiresAtMs = asset.expiresAt ? new Date(asset.expiresAt).getTime() : NaN
  const expired = Number.isFinite(expiresAtMs) && expiresAtMs <= now
  const reviewStatus = normalizeAssetReviewStatus(asset.status || 'Active')
  const active = !expired && reviewStatus === 'Active'
  const failed = reviewStatus === 'Failed'

  return {
    reviewed: true,
    active,
    failed,
    expired,
    assetUri: active ? asset.assetUri : '',
    expiresAt: asset.expiresAt || ''
  }
}

export function getSeedanceQuickAssetStatus(data = {}, now = Date.now()) {
  const state = getSeedanceQuickAsset(data, now)
  if (state.expired) return 'expired'
  if (state.active) return 'approved'
  if (state.failed) return 'failed'
  if (state.reviewed) return 'processing'
  return 'none'
}

export function getVideoReferenceImageUrlForTarget(sourceNode, fallbackUrl, isSeedance2Target, now = Date.now()) {
  if (!isSeedance2Target || !sourceNode?.data) return fallbackUrl
  const state = getSeedanceQuickAsset(sourceNode.data, now)
  return state.active ? state.assetUri : fallbackUrl
}

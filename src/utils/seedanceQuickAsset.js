import { normalizeAssetReviewStatus } from './assetReviewStatus.js'
import { getSeedanceRecyclingStatus, isSeedanceAssetReusable } from './seedanceAssetRecycling.js'
import { getSeedanceSourceUrl } from './seedanceMedia.js'

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

  const status = asset.deletedAt ? 'Expired' : getSeedanceRecyclingStatus(asset, now)
  const expired = String(status).toLowerCase() === 'expired'
  const reviewStatus = normalizeAssetReviewStatus(status)
  const active = !expired && reviewStatus === 'Active'
  const failed = reviewStatus === 'Failed'

  return {
    reviewed: true,
    active,
    failed,
    expired,
    assetUri: active || (expired && /^asset:\/\//i.test(asset.assetUri) && isSeedanceAssetReusable({ ...asset, Status: status })) ? asset.assetUri : '',
    expiresAt: asset.recyclingManaged ? asset.expiresAt || '' : ''
  }
}

export function getSeedanceQuickAssetStatus(data = {}, now = Date.now()) {
  const asset = data.seedanceQuickAsset
  if (asset?.sourceUrl && asset.sourceUrl !== getSeedanceSourceUrl(data, asset.assetType || 'Image')) return 'none'
  const state = getSeedanceQuickAsset(data, now)
  if (state.expired) return 'expired'
  if (state.active) return 'approved'
  if (state.failed) return 'failed'
  if (state.reviewed) return 'processing'
  return 'none'
}

export function getVideoReferenceImageUrlForTarget(sourceNode, fallbackUrl, isSeedance2Target, now = Date.now()) {
  if (!isSeedance2Target || !sourceNode?.data) return fallbackUrl
  if (!['approved', 'expired'].includes(getSeedanceQuickAssetStatus(sourceNode.data, now))) return fallbackUrl
  return getSeedanceQuickAsset(sourceNode.data, now).assetUri || fallbackUrl
}

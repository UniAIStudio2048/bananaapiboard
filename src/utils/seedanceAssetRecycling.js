import { normalizeAssetReviewStatus } from './assetReviewStatus.js'

export function getSeedanceRecyclingStatus(asset, now = Date.now()) {
  const status = asset?.Status || asset?.status || 'Active'
  if (asset?.recyclingManaged && ['active', 'expired'].includes(String(status).toLowerCase()) && (asset.recyclingExpired || new Date(asset.expiresAt).getTime() <= now)) return 'Expired'
  return status
}

export function isSeedanceAssetReusable(asset) {
  if (!asset) return false
  const status = getSeedanceRecyclingStatus(asset)
  return normalizeAssetReviewStatus(status) === 'Active' || (asset?.recyclingManaged === true && status === 'Expired')
}

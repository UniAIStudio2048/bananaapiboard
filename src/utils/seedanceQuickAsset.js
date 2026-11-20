import { normalizeAssetReviewStatus } from './assetReviewStatus.js'
import { getSeedanceRecyclingStatus, isSeedanceAssetReusable } from './seedanceAssetRecycling.js'
import { getSeedanceMediaType, getSeedanceSourceUrl } from './seedanceMedia.js'

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

export async function refreshPendingSeedanceVideoReferences(referenceUrls, sourceNodes, { loadAsset, updateAsset }) {
  const candidates = sourceNodes.flatMap(node => {
    const asset = node.data?.seedanceQuickAsset
    if (getSeedanceMediaType(asset) !== 'video' || getSeedanceQuickAssetStatus(node.data) !== 'processing') return []
    const sourceUrl = getSeedanceSourceUrl(node.data, 'Video')
    if (!referenceUrls.includes(sourceUrl) || asset.assetUri !== `asset://${asset.assetId}` || asset.recyclingExpired) return []
    return [{ node, asset, sourceUrl }]
  })

  const resolved = await Promise.all(candidates.map(async ({ node, asset, sourceUrl }) => {
    const result = await loadAsset(asset.assetId, { providerType: asset.providerType, groupId: asset.groupId })
    const current = result?.asset || result
    const returnedId = current?.Id || current?.id
    if (returnedId && String(returnedId) !== String(asset.assetId)) throw new Error('参考视频审核记录不匹配')
    const status = normalizeAssetReviewStatus(current?.Status || current?.status)
    if (status === 'Processing') throw new Error('参考视频仍在审核，请在审核通过后重新生成')
    if (status === 'Failed') throw new Error('参考视频审核未通过，请更换素材或查看审核结果')

    updateAsset(node.id, {
      ...asset,
      sourceUrl,
      status,
      assetUrl: current.URL || asset.assetUrl,
      reviewedAt: asset.reviewedAt || new Date().toISOString(),
      error: null
    })
    return [sourceUrl, asset.assetUri]
  }))
  const replacements = new Map(resolved)
  return referenceUrls.map(url => replacements.get(url) || url)
}

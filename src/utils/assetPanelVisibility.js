const STANDARD_ASSET_TYPES = new Set(['text', 'image', 'video', 'audio'])
const SEEDANCE_OPENAPI_TYPE = 'seedance-openapi-pro-character'
const SEEDANCE_QUICK_TYPE = 'seedance-quick-character'
const SEEDANCE_TYPE = 'seedance-character'
const SORA_TYPE = 'sora-character'
const BYTEFOR_TYPE = 'bytefor-character'

const EMPTY_STATS = {
  all: 0,
  text: 0,
  image: 0,
  video: 0,
  audio: 0,
  [SORA_TYPE]: 0,
  [SEEDANCE_TYPE]: 0,
  [BYTEFOR_TYPE]: 0
}

function normalizeGroupIdSet(groupIds) {
  if (groupIds instanceof Set) return groupIds
  if (Array.isArray(groupIds)) return new Set(groupIds.filter(Boolean))
  return new Set()
}

export function getAssetMetadata(asset) {
  if (!asset?.metadata) return {}
  if (typeof asset.metadata !== 'string') return asset.metadata || {}
  try {
    return JSON.parse(asset.metadata || '{}')
  } catch {
    return {}
  }
}

function getSeedanceGroupId(asset) {
  const metadata = getAssetMetadata(asset)
  return asset?.GroupId || metadata.groupId || ''
}

export function getAssetPanelDisplayType(asset, context = {}) {
  if (asset?.type === SEEDANCE_OPENAPI_TYPE && context.seedanceActiveProvider === 'seedance_openapi_pro') {
    return SEEDANCE_TYPE
  }
  return asset?.type || ''
}

export function normalizeAssetForAssetPanel(asset, context = {}) {
  const displayType = getAssetPanelDisplayType(asset, context)
  if (!displayType || displayType === asset?.type) return asset
  return {
    ...asset,
    type: displayType,
    _assetPanelOriginalType: asset.type
  }
}

function isSeedanceAssetVisible(asset, context) {
  if (!context.seedanceFeaturesEnabled) return false
  if (asset.type === SEEDANCE_QUICK_TYPE) return false

  const activeProvider = context.seedanceActiveProvider || ''
  if (asset.type === SEEDANCE_OPENAPI_TYPE && activeProvider !== 'seedance_openapi_pro') {
    return false
  }
  if (asset.type === SEEDANCE_TYPE && activeProvider === 'seedance_openapi_pro') {
    return false
  }

  const activeGroupIds = normalizeGroupIdSet(context.seedanceActiveGroupIds)
  if (activeGroupIds.size === 0) return false
  const groupId = getSeedanceGroupId(asset)
  return Boolean(groupId && activeGroupIds.has(groupId))
}

export function isAssetVisibleInAssetPanel(asset, context = {}) {
  if (!asset?.type) return false

  if (STANDARD_ASSET_TYPES.has(asset.type)) return true
  if (asset.type === SORA_TYPE) return context.soraCharacterLibraryEnabled !== false
  if (asset.type === BYTEFOR_TYPE) return context.byteforCharacterLibraryEnabled === true
  if ([SEEDANCE_TYPE, SEEDANCE_OPENAPI_TYPE, SEEDANCE_QUICK_TYPE].includes(asset.type)) {
    return isSeedanceAssetVisible(asset, context)
  }

  return false
}

function assetMatchesSearch(asset, searchQuery) {
  const query = String(searchQuery || '').trim().toLowerCase()
  if (!query) return true
  return Boolean(
    asset.name?.toLowerCase().includes(query) ||
    asset.content?.toLowerCase().includes(query) ||
    asset.tags?.some(tag => String(tag).toLowerCase().includes(query))
  )
}

function assetMatchesTag(asset, selectedTag) {
  if (!selectedTag || selectedTag === 'all') return true
  if (selectedTag === 'favorite') return Boolean(asset.is_favorite)
  return Boolean(asset.tags && asset.tags.includes(selectedTag))
}

function getVisibleBaseAssets(assets, context = {}) {
  return (assets || [])
    .filter(asset => isAssetVisibleInAssetPanel(asset, context))
    .map(asset => normalizeAssetForAssetPanel(asset, context))
}

export function getVisibleAssetPanelAssets(assets, options = {}) {
  const selectedType = options.selectedType || 'all'
  return getVisibleBaseAssets(assets, options)
    .filter(asset => selectedType === 'all' || asset.type === selectedType)
    .filter(asset => assetMatchesTag(asset, options.selectedTag || 'all'))
    .filter(asset => assetMatchesSearch(asset, options.searchQuery || ''))
}

export function getAssetPanelStats(assets, context = {}) {
  const stats = { ...EMPTY_STATS }
  getVisibleBaseAssets(assets, context).forEach(asset => {
    stats.all++
    if (stats[asset.type] !== undefined) {
      stats[asset.type]++
    }
  })
  return stats
}

export function getAssetPanelTagCounts(assets, options = {}) {
  const selectedType = options.selectedType || 'all'
  const counts = { all: 0, favorite: 0 }

  getVisibleBaseAssets(assets, options)
    .filter(asset => selectedType === 'all' || asset.type === selectedType)
    .filter(asset => assetMatchesSearch(asset, options.searchQuery || ''))
    .forEach(asset => {
      counts.all++
      if (asset.is_favorite) counts.favorite++
      if (asset.tags) {
        asset.tags.forEach(tag => {
          counts[tag] = (counts[tag] || 0) + 1
        })
      }
    })

  return counts
}

export function getAssetPanelUserTags(assets, context = {}) {
  const tagSet = new Set()
  getVisibleBaseAssets(assets, context).forEach(asset => {
    if (asset.tags) {
      asset.tags.forEach(tag => tagSet.add(tag))
    }
  })
  return Array.from(tagSet)
}

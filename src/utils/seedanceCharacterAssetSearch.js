function parseMetadata(metadata) {
  if (!metadata) return {}
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata)
    } catch {
      return {}
    }
  }
  if (typeof metadata === 'object') return metadata
  return {}
}

function addSearchValue(values, value) {
  if (value === undefined || value === null) return
  const text = String(value).trim()
  if (text) values.push(text)
}

export function getSeedanceCharacterAssetSearchText(asset = {}) {
  const metadata = parseMetadata(asset.metadata)
  const values = []

  addSearchValue(values, asset.Name)
  addSearchValue(values, asset.name)
  addSearchValue(values, asset.Id)
  addSearchValue(values, asset.id)
  addSearchValue(values, asset.AssetId)
  addSearchValue(values, asset.assetId)
  addSearchValue(values, asset.AssetUri)
  addSearchValue(values, asset.assetUri)
  addSearchValue(values, asset.URL)
  addSearchValue(values, asset.url)
  addSearchValue(values, asset.FaceCode)
  addSearchValue(values, asset.faceCode)

  addSearchValue(values, metadata.assetId)
  addSearchValue(values, metadata.assetUri)
  addSearchValue(values, metadata.AssetId)
  addSearchValue(values, metadata.AssetUri)
  addSearchValue(values, metadata.faceCode)
  addSearchValue(values, metadata.FaceCode)

  return values.join(' ').toLowerCase()
}

export function matchesSeedanceCharacterAssetSearch(asset, query) {
  const terms = String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (terms.length === 0) return true

  const text = getSeedanceCharacterAssetSearchText(asset)
  return terms.every(term => text.includes(term))
}

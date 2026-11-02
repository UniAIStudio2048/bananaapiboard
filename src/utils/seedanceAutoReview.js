export const isAutoReviewConnected = provider => ['volcengine', 'stars_asset', 'tokenhub_asset'].includes(provider)

export function getAutoReviewMaterials(provider, model, nodeSettings = {}, preferences = {}) {
  const saved = preferences.canvas?.autoReviewMaterials?.[model]
  return isAutoReviewConnected(provider) && (saved ?? nodeSettings[model]) !== false
}

import { t as translateUi } from '../i18n/index.js'
import { normalizeAssetReviewStatus } from './assetReviewStatus.js'

export function createSeedanceReviewController({ getData, getSourceUrl, assetType, nodeId, update, resolveUrl, getProvider, create, poll, notify }) {
  let submitting = false
  let disposed = false
  let cancelPolling = null
  let pollingId = ''

  function isCurrent(sourceUrl, assetId) {
    return !disposed && getData() && getSourceUrl() === sourceUrl && (!assetId || getData().seedanceQuickAsset?.assetId === assetId)
  }

  function resume() {
    const asset = getData()?.seedanceQuickAsset
    if (!asset?.assetId) return
    if (!asset.sourceUrl && getSourceUrl()) update({ sourceUrl: getSourceUrl(), assetType: asset.assetType || assetType })
    if (normalizeAssetReviewStatus(asset.status) !== 'Processing') return
    if (asset.deletedAt || asset.recyclingExpired) return
    const sourceUrl = asset.sourceUrl || getSourceUrl()
    if (!isCurrent(sourceUrl) || pollingId === asset.assetId) return
    cancelPolling?.()
    pollingId = asset.assetId
    const task = poll(asset.assetId, {
      providerType: asset.providerType,
      groupId: asset.groupId,
      onStatusChange(status, result) {
        if (isCurrent(sourceUrl, asset.assetId)) update({ status, error: status === 'Failed' ? result.FailMessage || '素材审核未通过' : null })
      }
    })
    cancelPolling = task.cancel
    task.promise.then(result => {
      if (!isCurrent(sourceUrl, asset.assetId)) return
      const status = normalizeAssetReviewStatus(result.Status || result.status)
      update({ status, assetUrl: result.URL || asset.assetUrl, reviewedAt: status === 'Active' ? new Date().toISOString() : null, error: null })
      if (status === 'Active') notify(translateUi('uiMessages.mdc0d15e32c49'), 'success')
    }).catch(error => {
      if (!isCurrent(sourceUrl, asset.assetId)) return
      update({ error: error.message || '审核状态查询失败，请重试查询' })
      notify(error.message || translateUi('uiMessages.mc6c440b0178b'), 'error')
    }).finally(() => {
      if (pollingId === asset.assetId) pollingId = ''
    })
  }

  async function submit() {
    if (submitting || disposed) return
    const sourceUrl = getSourceUrl()
    if (!sourceUrl) return notify(translateUi('uiMessages.m828878d11d15'), 'warning')
    submitting = true
    try {
      const providerType = await getProvider()
      const existing = getData()?.seedanceQuickAsset
      const sameSource = existing && (!existing.sourceUrl || existing.sourceUrl === sourceUrl)
      const sameProvider = !existing?.providerType || existing.providerType === providerType
      const expired = existing?.deletedAt || existing?.recyclingExpired ||
        (existing?.recyclingManaged && new Date(existing.expiresAt).getTime() <= Date.now())
      if (sameSource && sameProvider && !expired && normalizeAssetReviewStatus(existing.status) === 'Active') return
      if (sameSource && sameProvider && !expired && existing.assetId && normalizeAssetReviewStatus(existing.status) === 'Processing') {
        resume()
        return
      }
      if (assetType !== 'Image' && ['seedance_openapi_pro', 'bytefor'].includes(providerType)) throw new Error(translateUi('uiMessages.m10870919e732'))
      const url = await resolveUrl(sourceUrl)
      if (!isCurrent(sourceUrl)) return
      const result = await create({ URL: url, AssetType: assetType, Name: `Seedance快捷角色_${nodeId}`, sourceNodeId: nodeId, providerType })
      if (!isCurrent(sourceUrl)) return
      const quickAsset = result.quickAsset || {}
      const assetId = quickAsset.assetId || result.asset?.Id || result.Id
      if (!assetId) throw new Error(translateUi('uiMessages.ma6808c4df911'))
      const savedProvider = quickAsset.providerType || providerType
      const faceCode = quickAsset.faceCode || result.asset?.FaceCode || assetId
      update({
        expiresAt: null, recyclingManaged: false, recyclingExpired: false, deletedAt: null,
        ...quickAsset,
        assetId,
        assetUri: quickAsset.assetUri || (['seedance_openapi_pro', 'bytefor'].includes(savedProvider) ? `face:${faceCode}` : `asset://${assetId}`),
        assetType,
        sourceUrl,
        assetUrl: result.asset?.URL || url,
        providerType: savedProvider,
        groupId: quickAsset.groupId || result.asset?.GroupId,
        status: normalizeAssetReviewStatus(quickAsset.status || result.asset?.Status || 'Processing'),
        error: null
      })
      notify(translateUi('uiMessages.mdd3e67b8ecd2'), 'info')
      resume()
    } catch (error) {
      if (isCurrent(sourceUrl)) notify(translateUi('uiMessages.m2e23cfb7a798', { value1: (error.message || translateUi('canvas.unknownError')) }), 'error')
    } finally {
      submitting = false
    }
  }

  function dispose() {
    disposed = true
    cancelPolling?.()
  }

  return { submit, resume, dispose }
}

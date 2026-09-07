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
    if (asset.expiresAt && new Date(asset.expiresAt).getTime() <= Date.now()) return
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
      if (status === 'Active') notify('素材已过审', 'success')
    }).catch(error => {
      if (!isCurrent(sourceUrl, asset.assetId)) return
      update({ error: error.message || '审核状态查询失败，请重试查询' })
      notify(error.message || '审核状态查询失败，请重试查询', 'error')
    }).finally(() => {
      if (pollingId === asset.assetId) pollingId = ''
    })
  }

  async function submit() {
    if (submitting || disposed) return
    const sourceUrl = getSourceUrl()
    if (!sourceUrl) return notify('未找到素材', 'warning')
    const existing = getData()?.seedanceQuickAsset
    const sameSource = existing && (!existing.sourceUrl || existing.sourceUrl === sourceUrl)
    const expired = existing?.expiresAt && new Date(existing.expiresAt).getTime() <= Date.now()
    if (sameSource && !expired && normalizeAssetReviewStatus(existing.status) === 'Active') return
    if (sameSource && !expired && existing.assetId && normalizeAssetReviewStatus(existing.status) === 'Processing') {
      resume()
      return
    }
    submitting = true
    try {
      const providerType = await getProvider()
      if (assetType !== 'Image' && ['seedance_openapi_pro', 'bytefor'].includes(providerType)) throw new Error('当前素材渠道仅支持图片角色，不支持视频或音频')
      const url = await resolveUrl(sourceUrl)
      if (!isCurrent(sourceUrl)) return
      const result = await create({ URL: url, AssetType: assetType, Name: `Seedance快捷角色_${nodeId}`, sourceNodeId: nodeId, providerType })
      if (!isCurrent(sourceUrl)) return
      const quickAsset = result.quickAsset || {}
      const assetId = quickAsset.assetId || result.asset?.Id || result.Id
      if (!assetId) throw new Error('快捷资产接口返回数据异常')
      const savedProvider = quickAsset.providerType || providerType
      const faceCode = quickAsset.faceCode || result.asset?.FaceCode || assetId
      update({ ...quickAsset, assetId, assetUri: quickAsset.assetUri || (['seedance_openapi_pro', 'bytefor'].includes(savedProvider) ? `face:${faceCode}` : `asset://${assetId}`), assetType, sourceUrl, assetUrl: result.asset?.URL || url, providerType: savedProvider, groupId: quickAsset.groupId || result.asset?.GroupId, status: normalizeAssetReviewStatus(quickAsset.status || result.asset?.Status || 'Processing'), error: null })
      notify('已提交素材审核', 'info')
      resume()
    } catch (error) {
      if (isCurrent(sourceUrl)) notify(`提交过审失败：${error.message || '未知错误'}`, 'error')
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

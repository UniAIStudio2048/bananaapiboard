/**
 * Canvas 资产管理 API
 * 管理用户的文案、图片、视频、音频等资源
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

/**
 * 获取API基础URL
 */
function getApiBase() {
  const url = getApiUrl('')
  return url || ''
}

/**
 * 获取带认证的请求头
 */
function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

/**
 * 获取用户资产列表
 * @param {Object} params - 查询参数
 * @param {string} params.type - 资产类型筛选 (text/image/video/audio)
 * @param {string} params.tag - 标签筛选
 * @param {boolean} params.favorite - 只显示收藏
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 * @param {string} params.spaceType - 空间类型 (personal/team/all)
 * @param {string} params.teamId - 团队ID (spaceType=team时需要)
 */
export async function getAssets(params = {}) {
  const queryParams = new URLSearchParams({
    page: params.page || 1,
    pageSize: params.pageSize || 100,
    ...(params.type && { type: params.type }),
    ...(params.tag && { tag: params.tag }),
    ...(params.favorite && { favorite: 'true' }),
    ...(params.spaceType && { spaceType: params.spaceType }),
    ...(params.teamId && { teamId: params.teamId })
  })
  
  const response = await fetch(`${getApiBase()}/api/canvas/assets?${queryParams}`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '获取资产列表失败')
  }
  
  return response.json()
}

/**
 * 获取单个资产详情
 * @param {string} assetId - 资产ID
 */
export async function getAsset(assetId) {
  const response = await fetch(`${getApiBase()}/api/canvas/assets/${assetId}`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '获取资产失败')
  }
  
  return response.json()
}

/**
 * 保存资产
 * @param {Object} assetData - 资产数据
 * @param {string} assetData.type - 资产类型 (text/image/video/audio)
 * @param {string} assetData.name - 资产名称
 * @param {string} assetData.content - 内容（文本类型）
 * @param {string} assetData.url - 文件URL
 * @param {string} assetData.thumbnail_url - 缩略图URL
 * @param {number} assetData.size - 文件大小
 * @param {string} assetData.source_node_id - 来源节点ID
 * @param {string} assetData.source_workflow_id - 来源工作流ID
 * @param {string[]} assetData.tags - 标签数组
 */
export async function saveAsset(assetData) {
  const response = await fetch(`${getApiBase()}/api/canvas/assets`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(assetData)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '保存资产失败')
  }
  
  return response.json()
}

/**
 * 更新资产
 * @param {string} assetId - 资产ID
 * @param {Object} updates - 更新数据
 */
export async function updateAsset(assetId, updates) {
  const response = await fetch(`${getApiBase()}/api/canvas/assets/${assetId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '更新资产失败')
  }
  
  return response.json()
}

/**
 * 删除资产
 * @param {string} assetId - 资产ID
 */
export async function deleteAsset(assetId) {
  const response = await fetch(`${getApiBase()}/api/canvas/assets/${assetId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '删除资产失败')
  }
  
  return response.json()
}

/**
 * 切换收藏状态
 * @param {string} assetId - 资产ID
 */
export async function toggleFavorite(assetId) {
  const response = await fetch(`${getApiBase()}/api/canvas/assets/${assetId}/favorite`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '操作失败')
  }
  
  return response.json()
}

/**
 * 更新资产标签
 * @param {string} assetId - 资产ID
 * @param {string[]} tags - 新的标签数组
 */
export async function updateAssetTags(assetId, tags) {
  const response = await fetch(`${getApiBase()}/api/canvas/assets/${assetId}/tags`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tags })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '更新标签失败')
  }
  
  return response.json()
}

/**
 * 批量操作资产
 * @param {string[]} assetIds - 资产ID数组
 * @param {string} action - 操作类型 (delete/favorite/unfavorite/tag)
 * @param {Object} params - 额外参数
 */
export async function batchOperation(assetIds, action, params = {}) {
  const response = await fetch(`${getApiBase()}/api/canvas/assets/batch`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ assetIds, action, ...params })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '批量操作失败')
  }
  
  return response.json()
}


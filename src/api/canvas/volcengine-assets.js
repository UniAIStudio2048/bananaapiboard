/**
 * 火山引擎 Asset API - Seedance 角色资产管理
 * 管理角色组和角色资产的 CRUD 操作
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function getApiBase() {
  const url = getApiUrl('')
  return url || ''
}

function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

// ========== 角色组 ==========

/**
 * 创建角色组
 * @param {Object} data - { Name, Description, spaceType, teamId }
 */
export async function createAssetGroup(data) {
  const response = await fetch(`${getApiBase()}/api/volcengine-asset/groups`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '创建角色组失败')
  }
  return response.json()
}

/**
 * 获取角色组列表
 * @param {Object} params - 查询参数
 */
export async function listAssetGroups(params = {}) {
  const queryParams = new URLSearchParams()
  if (params.keyword) queryParams.set('keyword', params.keyword)
  if (params.page) queryParams.set('page', params.page)
  if (params.pageSize) queryParams.set('pageSize', params.pageSize)
  const qs = queryParams.toString()
  const url = `${getApiBase()}/api/volcengine-asset/groups${qs ? '?' + qs : ''}`
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '获取角色组列表失败')
  }
  return response.json()
}

/**
 * 获取单个角色组详情
 */
export async function getAssetGroup(id) {
  const response = await fetch(`${getApiBase()}/api/volcengine-asset/groups/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '获取角色组失败')
  }
  return response.json()
}

/**
 * 更新角色组
 */
export async function updateAssetGroup(id, data) {
  const response = await fetch(`${getApiBase()}/api/volcengine-asset/groups/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '更新角色组失败')
  }
  return response.json()
}

// ========== 角色资产 ==========

/**
 * 创建角色资产
 * @param {Object} data - { GroupId, URL, AssetType, Name }
 */
export async function createAsset(data) {
  const response = await fetch(`${getApiBase()}/api/volcengine-asset/assets`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '创建角色资产失败')
  }
  return response.json()
}

/**
 * 获取角色资产列表
 * @param {Object} params - { groupIds, status, keyword }
 */
export async function listAssets(params = {}) {
  const queryParams = new URLSearchParams()
  if (params.groupIds) queryParams.set('groupIds', params.groupIds.join(','))
  if (params.status) queryParams.set('status', params.status)
  if (params.keyword) queryParams.set('keyword', params.keyword)
  if (params.page) queryParams.set('page', params.page)
  if (params.pageSize) queryParams.set('pageSize', params.pageSize)
  const qs = queryParams.toString()
  const url = `${getApiBase()}/api/volcengine-asset/assets${qs ? '?' + qs : ''}`
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '获取角色资产列表失败')
  }
  return response.json()
}

/**
 * 获取单个角色资产详情
 */
export async function getAsset(id) {
  const response = await fetch(`${getApiBase()}/api/volcengine-asset/assets/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '获取角色资产失败')
  }
  return response.json()
}

/**
 * 更新角色资产
 */
export async function updateAsset(id, data) {
  const response = await fetch(`${getApiBase()}/api/volcengine-asset/assets/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '更新角色资产失败')
  }
  return response.json()
}

/**
 * 删除角色资产
 */
export async function deleteAsset(id) {
  const response = await fetch(`${getApiBase()}/api/volcengine-asset/assets/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '删除角色资产失败')
  }
  return response.json()
}

/**
 * 删除角色组（含组内所有资产）
 */
export async function deleteAssetGroup(id) {
  const response = await fetch(`${getApiBase()}/api/volcengine-asset/groups/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '删除角色组失败')
  }
  return response.json()
}

// ========== 轮询工具 ==========

/**
 * 轮询资产状态直到完成或失败
 * @param {string} assetId
 * @param {Object} options - { interval, timeout, onStatusChange }
 * @returns {{ promise: Promise, cancel: Function }}
 */
export function pollAssetStatus(assetId, { interval = 3000, timeout = 120000, onStatusChange } = {}) {
  let cancelled = false
  let timer = null

  const promise = new Promise((resolve, reject) => {
    const startTime = Date.now()

    async function check() {
      if (cancelled) return
      try {
        const result = await getAsset(assetId)
        const asset = result.asset || result
        const status = asset.Status || asset.status

        if (onStatusChange) onStatusChange(status, asset)

        if (status === 'Active') {
          resolve(asset)
          return
        }
        if (status === 'Failed') {
          reject(new Error(asset.FailMessage || '角色资产创建失败'))
          return
        }
        if (Date.now() - startTime > timeout) {
          reject(new Error('轮询超时'))
          return
        }
        timer = setTimeout(check, interval)
      } catch (err) {
        if (!cancelled) reject(err)
      }
    }

    check()
  })

  function cancel() {
    cancelled = true
    if (timer) clearTimeout(timer)
  }

  return { promise, cancel }
}

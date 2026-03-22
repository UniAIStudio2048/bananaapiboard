import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

export async function getCameraPresets(spaceType = 'personal', teamId = null) {
  const params = new URLSearchParams({ spaceType })
  if (teamId) params.append('teamId', teamId)

  const response = await fetch(getApiUrl(`/api/canvas/camera-presets?${params}`), {
    method: 'GET',
    headers: getAuthHeaders()
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '获取摄像机预设失败')
  }

  return response.json()
}

export async function createCameraPreset({ name, settings, summary, spaceType, teamId }) {
  const response = await fetch(getApiUrl('/api/canvas/camera-presets'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, settings, summary, spaceType, teamId })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '创建摄像机预设失败')
  }

  return response.json()
}

export async function updateCameraPreset(id, { name, settings, summary, sortOrder }) {
  const response = await fetch(getApiUrl(`/api/canvas/camera-presets/${id}`), {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, settings, summary, sortOrder })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '更新摄像机预设失败')
  }

  return response.json()
}

export async function deleteCameraPreset(id) {
  const response = await fetch(getApiUrl(`/api/canvas/camera-presets/${id}`), {
    method: 'DELETE',
    headers: getAuthHeaders()
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '删除摄像机预设失败')
  }

  return response.json()
}

export async function setActiveCameraPreset(presetId, spaceType = 'personal', teamId = null) {
  const response = await fetch(getApiUrl('/api/canvas/camera-presets/active'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ presetId, spaceType, teamId })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '设置激活预设失败')
  }

  return response.json()
}

import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function getAuthHeaders(json = false) {
  const token = localStorage.getItem('token')
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function parseSkillsResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || data.error || fallbackMessage)
    error.status = response.status
    error.body = data
    throw error
  }
  return data
}

export async function getSkillKeys() {
  const response = await fetch(getApiUrl('/api/skills/keys'), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseSkillsResponse(response, '加载 Skills API Key 失败')
}

export async function createSkillKey(payload = {}) {
  const response = await fetch(getApiUrl('/api/skills/keys'), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload)
  })
  return parseSkillsResponse(response, '创建 Skills API Key 失败')
}

export async function resetSkillKey(keyId) {
  const response = await fetch(getApiUrl(`/api/skills/keys/${encodeURIComponent(keyId)}/reset`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(true),
    body: JSON.stringify({})
  })
  return parseSkillsResponse(response, '重置 Skills API Key 失败')
}

export async function getSkillPackage() {
  const response = await fetch(getApiUrl('/api/skills/package'), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseSkillsResponse(response, '加载 Skills 安装内容失败')
}

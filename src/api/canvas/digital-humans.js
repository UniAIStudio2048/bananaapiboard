import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { useTeamStore } from '@/stores/team'

function getHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function request(path, options = {}) {
  const response = await fetch(getApiUrl(path), {
    credentials: 'include',
    headers: getHeaders(),
    ...options
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || data.error || '数字人请求失败')
  return data
}

function withSpaceParams(input) {
  const spaceParams = useTeamStore().getSpaceParams('current')
  return {
    ...input,
    spaceType: spaceParams.spaceType,
    ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
  }
}

export function getDigitalHumanChannels() {
  return request('/api/digital-humans/channels')
}

export function createDigitalHuman(input) {
  return request('/api/digital-humans', { method: 'POST', body: JSON.stringify(withSpaceParams(input)) })
}

export function getDigitalHumanTask(taskId) {
  return request(`/api/digital-humans/tasks/${encodeURIComponent(taskId)}`)
}

export function createDigitalHumanConsent(assetId) {
  return request(`/api/digital-humans/${encodeURIComponent(assetId)}/consent`, { method: 'POST', body: '{}' })
}

export function deleteDigitalHuman(assetId) {
  return request(`/api/digital-humans/${encodeURIComponent(assetId)}`, { method: 'DELETE' })
}

export function createDigitalHumanVideo(input) {
  return request('/api/digital-humans/videos', { method: 'POST', body: JSON.stringify(withSpaceParams(input)) })
}

export function createDigitalHumanLipsync(input) {
  return request('/api/digital-humans/lipsyncs', { method: 'POST', body: JSON.stringify(withSpaceParams(input)) })
}

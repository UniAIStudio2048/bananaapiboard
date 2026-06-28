import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { useTeamStore } from '@/stores/team'

function getAuthHeaders({ json = false } = {}) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function parseVideoToolResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  let body = {}

  if (text) {
    if (contentType.includes('application/json') || /^[\[{]/.test(text.trim())) {
      try {
        body = JSON.parse(text)
      } catch {
        body = { message: text }
      }
    } else {
      body = { message: text }
    }
  }

  if (!response.ok) {
    const error = new Error(body.message || body.error || fallbackMessage)
    error.status = response.status
    error.body = body
    throw error
  }

  return body
}

async function videoToolFetch(path, { method = 'GET', body } = {}) {
  const response = await fetch(getApiUrl(path), {
    method,
    credentials: 'include',
    headers: getAuthHeaders({ json: body !== undefined }),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })

  return parseVideoToolResponse(response, '视频工具请求失败')
}

function withCurrentSpaceParams(payload = {}) {
  const teamStore = useTeamStore()
  const spaceParams = teamStore.getSpaceParams('current')
  return {
    ...payload,
    spaceType: spaceParams.spaceType,
    ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
  }
}

export function getSubtitleEraseConfig() {
  return videoToolFetch('/api/video-tools/subtitle-erase/config')
}

export function estimateSubtitleErase(payload) {
  return videoToolFetch('/api/video-tools/subtitle-erase/estimate', {
    method: 'POST',
    body: payload
  })
}

export function createSubtitleEraseTask(payload) {
  return videoToolFetch('/api/video-tools/subtitle-erase/tasks', {
    method: 'POST',
    body: withCurrentSpaceParams(payload)
  })
}

export function getSubtitleEraseTask(taskId) {
  return videoToolFetch(`/api/video-tools/subtitle-erase/tasks/${encodeURIComponent(taskId)}`)
}

export function exportVideoTimeline(payload) {
  return videoToolFetch('/api/video-tools/edit/export', {
    method: 'POST',
    body: payload
  })
}

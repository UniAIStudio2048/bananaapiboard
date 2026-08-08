import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function headers(json = false) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function request(path, options = {}) {
  const response = await fetch(getApiUrl(path), {
    credentials: 'include',
    ...options,
    headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Agent 请求失败')
    error.status = response.status
    error.body = data
    throw error
  }
  return data
}

export const getSkillCatalog = () => request('/api/canvas/skills/catalog')
export const getMySkills = () => request('/api/canvas/skills/mine')
export const getFavoriteSkills = () => request('/api/canvas/skills/favorites')
export const favoriteSkill = id => request(`/api/canvas/skills/${encodeURIComponent(id)}/favorite`, { method: 'POST' })
export const unfavoriteSkill = id => request(`/api/canvas/skills/${encodeURIComponent(id)}/favorite`, { method: 'DELETE' })
export const referenceSkill = id => request(`/api/canvas/skills/${encodeURIComponent(id)}/reference`, { method: 'POST' })
export const getAgentGrants = () => request('/api/canvas/agent/grants')
export const revokeAgentGrant = id => request(`/api/canvas/agent/grants/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const createMySkill = payload => request('/api/canvas/skills/mine', { method: 'POST', body: JSON.stringify(payload) })
export const updateMySkill = (id, payload) => request(`/api/canvas/skills/mine/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) })
export const disableMySkill = id => request(`/api/canvas/skills/mine/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const createAgentRun = payload => request('/api/canvas/agent/runs', { method: 'POST', body: JSON.stringify(payload) })
export const decideAgentRun = (id, payload) => request(`/api/canvas/agent/runs/${encodeURIComponent(id)}/decision`, {
  method: 'POST',
  body: JSON.stringify(typeof payload === 'string' ? { decision: payload } : payload)
})

export async function streamAgentRun(id, { onEvent, lastEventId = 0, signal } = {}) {
  const response = await fetch(getApiUrl(`/api/canvas/agent/runs/${encodeURIComponent(id)}/events?last_event_id=${Number(lastEventId) || 0}`), {
    headers: headers(false),
    credentials: 'include',
    signal
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || data.error || 'Agent 事件流连接失败')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventId = Number(lastEventId) || 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''
    for (const frame of frames) {
      let data = null
      for (const line of frame.split('\n')) {
        if (line.startsWith('id:')) eventId = Number(line.slice(3).trim()) || eventId
        if (line.startsWith('data:')) data = line.slice(5).trim()
      }
      if (!data) continue
      const event = JSON.parse(data)
      await onEvent?.(event, eventId)
    }
  }
  return eventId
}

export function createAgentIdempotencyKey(prefix = 'agent') {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}:${id}`
}

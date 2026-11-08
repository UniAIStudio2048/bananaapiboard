/**
 * 画布工作流编辑租约 API（单例）。状态与协议见 @/utils/canvasEditLease.js
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { createEditLeaseClient, getCanvasSessionId } from '@/utils/canvasEditLease.js'

function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function request(path, { headers = {}, body = {}, keepalive = false } = {}) {
  const response = await fetch(getApiUrl(path), {
    method: 'POST',
    credentials: 'include',
    keepalive,
    headers: { ...getAuthHeaders(), ...headers },
    body: JSON.stringify(body)
  })
  let data = {}
  try { data = await response.json() } catch { /* 空响应 */ }
  return { ok: response.ok, status: response.status, data }
}

export const canvasEditLease = createEditLeaseClient({
  request,
  getSessionId: () => getCanvasSessionId(),
  getBeaconAuth: () => {
    const token = localStorage.getItem('token')
    return { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }
})

export { getCanvasSessionId }

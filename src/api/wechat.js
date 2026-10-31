import { getApiUrl, getTenantHeaders } from '@/config/tenant'

export async function wechatRequest(action, body, authenticated = false) {
  const token = authenticated ? localStorage.getItem('token') : null
  const response = await fetch(getApiUrl(`/api/auth/login/wechat/${action}`), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...getTenantHeaders(), 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'wechat_service_unavailable')
  return result
}

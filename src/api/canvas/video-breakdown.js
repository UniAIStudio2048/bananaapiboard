import { getApiUrl, getTenantHeaders } from '@/config/tenant'

export async function requestVideoBreakdown(path, body, { signal, method } = {}) {
  const token = localStorage.getItem('token')
  const response = await fetch(getApiUrl(`/api/video-tools/breakdown${path}`), {
    method: method || (body ? 'POST' : 'GET'),
    headers: { ...getTenantHeaders(), 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000)
  })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.message || '逐帧拉片请求失败'), { status: response.status })
  return data
}

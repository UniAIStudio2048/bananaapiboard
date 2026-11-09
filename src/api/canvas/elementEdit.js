import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function headers() {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

export async function annotateImageElement(payload) {
  const response = await fetch(getApiUrl('/api/canvas/image-element-annotate'), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || data.error || '元素识别失败')
    error.code = data.error
    error.status = response.status
    throw error
  }
  return data
}

export async function getElementEditConfig() {
  const response = await fetch(getApiUrl('/api/canvas/element-edit/config'), { headers: headers() })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || '元素编辑配置加载失败')
  return data
}

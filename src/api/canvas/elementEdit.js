import { t as translateUi } from '../../i18n/index.js'
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
    const error = new Error(data.message || data.error || translateUi('uiMessages.m87b00093b5f0'))
    error.code = data.error
    error.status = response.status
    throw error
  }
  return data
}

export async function getElementEditConfig() {
  const response = await fetch(getApiUrl('/api/canvas/element-edit/config'), { headers: headers() })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || translateUi('uiMessages.m25647c02b047'))
  return data
}

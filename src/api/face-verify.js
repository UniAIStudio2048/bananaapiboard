/**
 * H5 真人认证 API
 * 用于用户侧发起和查询真人扫脸认证
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function getApiBase() {
  const url = getApiUrl('')
  return url || ''
}

function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

/**
 * 检查当前用户的认证状态
 * @returns {Promise<{required: boolean, enabled: boolean, verified: boolean, expires_at?: string}>}
 */
export async function checkFaceVerifyStatus() {
  const response = await fetch(`${getApiBase()}/api/face-verify/status`, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    return { required: false, enabled: false, verified: false }
  }
  return response.json()
}

/**
 * 请求认证 Token（合并 CertH5ConfigInit + CertH5Token）
 * @param {Object} [params] - 可选参数（idcard_name, idcard_no, ref_image, configParams）
 * @returns {Promise<{byted_token: string, h5_url: string, h5_config_id: string}>}
 */
export async function requestFaceVerifyToken(params = {}) {
  const response = await fetch(`${getApiBase()}/api/face-verify/token`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(params)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '获取认证Token失败')
  }
  return response.json()
}

/**
 * 查询认证结果
 * @param {string} bytedToken - 认证 Token
 * @returns {Promise<{result: boolean, alive: boolean, score?: number}>}
 */
export async function queryFaceVerifyResult(bytedToken) {
  const response = await fetch(`${getApiBase()}/api/face-verify/query`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ byted_token: bytedToken, omit_data: true })
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '查询认证结果失败')
  }
  return response.json()
}

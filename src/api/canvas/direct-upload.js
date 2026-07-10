import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { useTeamStore } from '@/stores/team'
import { createCanvasDirectUploader } from '@/utils/canvasDirectUpload'
import { createCanvasUploadCheckpointStore } from '@/utils/canvasUploadCheckpoint'

function authHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function apiFetch(path, options = {}) {
  const response = await fetch(getApiUrl(path), {
    method: options.method || 'GET',
    credentials: 'include',
    headers: authHeaders(),
    body: options.body == null ? undefined : JSON.stringify(options.body),
    signal: options.signal
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `上传控制请求失败 (${response.status})`)
    error.code = payload.error || 'canvas_upload_api_failed'
    error.status = response.status
    throw error
  }
  return payload
}

function directFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: 'omit'
  })
}

const uploader = createCanvasDirectUploader({
  apiFetch,
  directFetch,
  checkpointStore: createCanvasUploadCheckpointStore()
})

function currentSpaceOptions(options) {
  if (options.spaceType) return options
  try {
    const space = useTeamStore().getSpaceParams('current')
    return {
      ...options,
      spaceType: space.spaceType,
      teamId: space.teamId || null
    }
  } catch {
    return options
  }
}

export async function uploadCanvasFile(file, mediaType, options = {}) {
  if (!['image', 'video', 'audio'].includes(mediaType)) {
    throw new Error(`不支持的文件类型: ${mediaType}`)
  }
  const result = await uploader.upload(file, {
    ...currentSpaceOptions(options),
    mediaType
  })
  return {
    url: result.url,
    status: result.status,
    isCloud: true,
    assetId: result.assetId,
    uploadId: result.uploadId,
    key: result.key,
    contentType: result.contentType,
    size: result.size
  }
}

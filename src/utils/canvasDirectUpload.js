import { createCanvasUploadCheckpointStore } from './canvasUploadCheckpoint.js'

const DEFAULT_PART_SIZE = 8 * 1024 * 1024
const DEFAULT_CONCURRENCY = 3
const MAX_PART_ATTEMPTS = 3
const DEFAULT_SINGLE_RETRIES = 2
const MAX_SINGLE_RETRIES = 5

function uploadError(code, details = {}) {
  const error = new Error(code)
  error.code = code
  Object.assign(error, details)
  return error
}

function isMediaBody(value) {
  if (value == null) return false
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof FormData !== 'undefined' && value instanceof FormData) return true
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true
  return false
}

function assertJsonControlBody(body) {
  if (isMediaBody(body)) throw uploadError('canvas_upload_api_media_body_forbidden')
  if (body && typeof body === 'object') {
    for (const value of Object.values(body)) {
      if (isMediaBody(value)) throw uploadError('canvas_upload_api_media_body_forbidden')
    }
  }
}

async function readPayload(response) {
  if (response && typeof response.json === 'function') {
    const payload = await response.json()
    if (response.ok === false) {
      throw uploadError(payload?.error || 'canvas_upload_api_failed', { status: response.status })
    }
    return payload
  }
  return response
}

function requirePayload(payload) {
  if (!payload || payload.success === false) {
    throw uploadError(payload?.error || 'canvas_upload_api_failed')
  }
  return payload
}

function fileFingerprint(file) {
  return `${file.name}:${file.size}:${file.type}:${file.lastModified || 0}`
}

function getEtag(headers) {
  if (!headers) return null
  if (typeof headers.get === 'function') return headers.get('etag') || headers.get('ETag')
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'etag')
  return entry?.[1] || null
}

function normalizeResult(payload) {
  if (payload?.upload?.status !== 'completed' || !payload?.asset?.url) {
    throw uploadError('canvas_upload_not_completed')
  }
  return {
    status: payload.upload.status,
    url: payload.asset.url,
    assetId: payload.asset.id,
    uploadId: payload.upload.id,
    key: payload.asset.key,
    contentType: payload.asset.content_type,
    size: payload.asset.size,
    upload: payload.upload,
    asset: payload.asset
  }
}

function abortError(error, signal) {
  return signal?.aborted || error?.name === 'AbortError'
}

function singleRetryCount(value) {
  if (!Number.isInteger(value) || value < 0) return DEFAULT_SINGLE_RETRIES
  return Math.min(value, MAX_SINGLE_RETRIES)
}

function isRetryableSinglePutError(error) {
  if (error?.status != null) return error.status >= 500
  return error?.code !== 'canvas_upload_missing_etag'
}

export function createCanvasDirectUploader({
  apiFetch,
  directFetch = globalThis.fetch,
  checkpointStore = createCanvasUploadCheckpointStore(),
  partSize = DEFAULT_PART_SIZE,
  concurrency = DEFAULT_CONCURRENCY
}) {
  if (typeof apiFetch !== 'function' || typeof directFetch !== 'function') {
    throw uploadError('canvas_upload_client_unavailable')
  }

  const safePartSize = Number.isInteger(partSize) && partSize > 0 ? partSize : DEFAULT_PART_SIZE
  const safeConcurrency = Number.isInteger(concurrency) && concurrency > 0
    ? Math.min(concurrency, DEFAULT_CONCURRENCY)
    : DEFAULT_CONCURRENCY

  const apiRequest = async (url, { method = 'GET', body, signal } = {}) => {
    assertJsonControlBody(body)
    const payload = await readPayload(await apiFetch(url, { method, body, signal }))
    return requirePayload(payload)
  }

  const putDirect = async (url, headers, body, signal) => {
    const response = await directFetch(url, {
      method: 'PUT',
      headers: headers || {},
      body,
      signal,
      credentials: 'omit'
    })
    if (!response || response.ok === false) {
      throw uploadError('canvas_upload_direct_put_failed', { status: response?.status })
    }
    const etag = getEtag(response.headers)
    if (!etag) throw uploadError('canvas_upload_missing_etag')
    return etag
  }

  const complete = async (uploadId, body, signal) => {
    const payload = await apiRequest(`/api/canvas/uploads/${uploadId}/complete`, {
      method: 'POST',
      body,
      signal
    })
    return normalizeResult(payload)
  }

  const uploadSingle = async (file, upload, options) => {
    options.onProgress?.(0)
    const maxRetries = singleRetryCount(options.maxRetries)
    let etag = null
    let recoverConflict = false
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        etag = await putDirect(upload.upload_url, upload.headers, file, options.signal)
        break
      } catch (error) {
        if (abortError(error, options.signal)) throw error
        if (attempt > 0 && error?.status === 409) {
          recoverConflict = true
          break
        }
        if (attempt === maxRetries || !isRetryableSinglePutError(error)) throw error
      }
    }
    options.onProgress?.(1)
    return complete(upload.id, recoverConflict ? {} : { etag }, options.signal)
  }

  const presignParts = async (uploadId, partNumbers, signal) => {
    const payload = await apiRequest(`/api/canvas/uploads/${uploadId}/parts/presign`, {
      method: 'POST',
      body: { part_numbers: partNumbers },
      signal
    })
    const parts = Array.isArray(payload.parts) ? payload.parts : []
    if (parts.length !== partNumbers.length) throw uploadError('canvas_upload_invalid_part_signatures')
    return new Map(parts.map(part => [part.part_number, part]))
  }

  const uploadMultipart = async ({ file, upload, serverParts, fingerprint, options }) => {
    const uploadPartSize = Number.isInteger(upload.part_size) && upload.part_size > 0
      ? upload.part_size
      : safePartSize
    const totalParts = Math.ceil(file.size / uploadPartSize)
    const completed = new Map()
    for (const part of serverParts || []) {
      if (
        Number.isInteger(part.part_number) && part.part_number >= 1 && part.part_number <= totalParts &&
        typeof part.etag === 'string' && part.etag
      ) {
        completed.set(part.part_number, {
          partNumber: part.part_number,
          etag: part.etag,
          size: Number(part.size) || Math.min(uploadPartSize, file.size - (part.part_number - 1) * uploadPartSize)
        })
      }
    }

    const saveCheckpoint = () => checkpointStore.set(fingerprint, {
      fingerprint,
      uploadId: upload.id,
      mode: 'multipart',
      completedParts: [...completed.values()].sort((a, b) => a.partNumber - b.partNumber)
    })
    await saveCheckpoint()

    let uploadedBytes = [...completed.values()].reduce((sum, part) => sum + part.size, 0)
    options.onProgress?.(file.size > 0 ? uploadedBytes / file.size : 0)
    const pending = []
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      if (!completed.has(partNumber)) pending.push(partNumber)
    }

    const signatures = new Map()
    for (let index = 0; index < pending.length; index += 100) {
      const batch = pending.slice(index, index + 100)
      const signed = await presignParts(upload.id, batch, options.signal)
      for (const [partNumber, part] of signed) signatures.set(partNumber, part)
    }

    let queueIndex = 0
    const worker = async () => {
      while (queueIndex < pending.length) {
        if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        const partNumber = pending[queueIndex++]
        const start = (partNumber - 1) * uploadPartSize
        const end = Math.min(start + uploadPartSize, file.size)
        let signed = signatures.get(partNumber)
        let etag = null

        for (let attempt = 1; attempt <= MAX_PART_ATTEMPTS; attempt++) {
          try {
            etag = await putDirect(
              signed.upload_url,
              signed.headers,
              file.slice(start, end),
              options.signal
            )
            break
          } catch (error) {
            if (abortError(error, options.signal) || attempt === MAX_PART_ATTEMPTS) throw error
            signed = (await presignParts(upload.id, [partNumber], options.signal)).get(partNumber)
          }
        }

        const size = end - start
        completed.set(partNumber, { partNumber, etag, size })
        uploadedBytes += size
        await saveCheckpoint()
        options.onProgress?.(uploadedBytes / file.size)
      }
    }

    await Promise.all(Array.from(
      { length: Math.min(safeConcurrency, pending.length || 1) },
      () => worker()
    ))

    const parts = [...completed.values()]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map(part => ({ part_number: part.partNumber, etag: part.etag }))
    return complete(upload.id, { parts }, options.signal)
  }

  return {
    async upload(file, options = {}) {
      if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size) || file.size <= 0) {
        throw uploadError('canvas_upload_invalid_file')
      }
      const fingerprint = fileFingerprint(file)
      let checkpoint = await checkpointStore.get(fingerprint)
      let payload = null

      try {
        if (checkpoint?.uploadId) {
          try {
            payload = await apiRequest(`/api/canvas/uploads/${checkpoint.uploadId}`, {
              signal: options.signal
            })
          } catch (error) {
            if (error.code !== 'canvas_upload_not_found') throw error
            await checkpointStore.delete(fingerprint)
            checkpoint = null
          }
        }

        if (payload && checkpoint?.uploadId) {
          const resumedUpload = payload.upload
          if (resumedUpload?.status === 'completed' || resumedUpload?.status === 'completing') {
            const body = resumedUpload.mode === 'multipart' && resumedUpload.status === 'completing'
              ? {
                  parts: (checkpoint.completedParts || []).map(part => ({
                    part_number: part.partNumber,
                    etag: part.etag
                  }))
                }
              : {}
            const result = await complete(resumedUpload.id, body, options.signal)
            await checkpointStore.delete(fingerprint)
            return result
          }

          if (resumedUpload?.mode === 'single' && ['created', 'uploading'].includes(resumedUpload.status)) {
            try {
              const result = await complete(resumedUpload.id, {}, options.signal)
              await checkpointStore.delete(fingerprint)
              return result
            } catch (error) {
              if (error.code !== 'canvas_upload_verification_failed' || error.status !== 409) throw error
              await apiRequest(`/api/canvas/uploads/${resumedUpload.id}`, { method: 'DELETE' })
              await checkpointStore.delete(fingerprint)
              checkpoint = null
              payload = null
            }
          }
        }

        if (!payload) {
          payload = await apiRequest('/api/canvas/uploads/presign', {
            method: 'POST',
            signal: options.signal,
            body: {
              filename: file.name,
              content_type: file.type,
              size: file.size,
              media_type: options.mediaType,
              workflow_id: options.workflowId || null,
              node_id: options.nodeId || null,
              space_type: options.spaceType || 'personal',
              team_id: options.teamId || null
            }
          })
        }

        const upload = payload.upload
        if (!upload?.id || !['single', 'multipart'].includes(upload.mode)) {
          throw uploadError('canvas_upload_invalid_presign')
        }
        if (!checkpoint?.uploadId) {
          checkpoint = {
            fingerprint,
            uploadId: upload.id,
            mode: upload.mode,
            completedParts: []
          }
          await checkpointStore.set(fingerprint, checkpoint)
        }
        const result = upload.mode === 'single'
          ? await uploadSingle(file, upload, options)
          : await uploadMultipart({
              file,
              upload,
              serverParts: payload.parts || [],
              fingerprint,
              options
            })
        await checkpointStore.delete(fingerprint)
        return result
      } catch (error) {
        if (abortError(error, options.signal)) {
          const uploadId = payload?.upload?.id || checkpoint?.uploadId
          if (uploadId) {
            try {
              await apiRequest(`/api/canvas/uploads/${uploadId}`, { method: 'DELETE' })
            } catch { /* preserve the original abort */ }
          }
          await checkpointStore.delete(fingerprint)
        }
        throw error
      }
    }
  }
}

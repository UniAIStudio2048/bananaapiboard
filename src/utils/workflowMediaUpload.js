import { t as translateUi } from '../i18n/index.js'
import { sanitizeWorkflowForSave } from './workflowSaveSanitizer.js'

// Keep already-clean worker JSON on the fast path: no second parse/stringify.
const MEDIA_PAYLOAD_RE = /data:|blob:|"(?:imageData|videoData|audioData|base64|previewData|originalData|sourceNode|targetNode)"|"data"\s*:\s*"|"type"\s*:\s*"Buffer"/i

export async function prepareWorkflowSaveBody(jsonBody, uploadMedia) {
  if (!MEDIA_PAYLOAD_RE.test(jsonBody)) return jsonBody
  const workflow = JSON.parse(jsonBody)
  const uploaded = new Map()
  const space = { spaceType: workflow.spaceType || 'personal', teamId: workflow.teamId || null }

  async function persist(value) {
    if (typeof value === 'string' && /^(data:|blob:)/i.test(value)) {
      if (!uploaded.has(value)) {
        uploaded.set(value, (async () => {
          try {
            const response = await fetch(value, { signal: AbortSignal.timeout(30000) })
            if (!response.ok) throw new Error(translateUi('uiMessages.m387274a421e9'))
            const blob = await response.blob()
            const type = blob.type.split('/')[0]
            if (!['image', 'video', 'audio'].includes(type)) throw new Error(translateUi('uiMessages.m21786ea9812c'))
            const ext = blob.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'
            const file = new File([blob], `workflow-${type}.${ext}`, { type: blob.type })
            const result = await uploadMedia(file, type, space)
            if (!result?.url || /^(data:|blob:)/i.test(result.url)) throw new Error(translateUi('uiMessages.m00d384323a83'))
            return result.url
          } catch (cause) {
            const error = new Error(translateUi('uiMessages.made8486ecccd', { value1: (cause.message) }))
            error.code = 'workflow_media_upload_failed'
            throw error
          }
        })())
      }
      return uploaded.get(value)
    }
    if (Array.isArray(value)) {
      const result = []
      for (const item of value) result.push(await persist(item))
      return result
    }
    if (value && typeof value === 'object') {
      const result = {}
      for (const [key, item] of Object.entries(value)) result[key] = await persist(item)
      return result
    }
    return value
  }

  // Drop Vue Flow's runtime node copies before traversing edges.
  const edges = (workflow.edges || []).map(({ sourceNode, targetNode, ...edge }) => edge)
  const prepared = {
    ...workflow,
    nodes: await persist(workflow.nodes || []),
    edges: await persist(edges),
    thumbnail_url: await persist(workflow.thumbnail_url)
  }
  return JSON.stringify({ ...prepared, ...sanitizeWorkflowForSave(prepared) })
}

/**
 * Persisted client-side generation submissions.
 *
 * This bridges the only window where canvas polling can be lost:
 * the backend accepts a request and creates/charges a task, but the browser
 * closes before the response writes taskId into the canvas node.
 */

const STORAGE_KEY = 'canvas_pending_generation_submissions'
const MAX_SUBMISSION_AGE_MS = 48 * 60 * 60 * 1000
const MAX_FIELD_LENGTH = 128
const MAX_TEXT_LENGTH = 2000

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function nowMs(now = Date.now) {
  return typeof now === 'function' ? now() : Date.now()
}

function createId(now = Date.now) {
  const ts = nowMs(now)
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : Math.random().toString(36).slice(2, 12)
  return `cgs-${ts}-${random}`
}

function truncate(value, max = MAX_FIELD_LENGTH) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (!text) return null
  return text.slice(0, max)
}

function loadSubmissions() {
  const storage = getStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch (error) {
    console.warn('[CanvasSubmission] 读取提交恢复记录失败:', error?.message || error)
    return []
  }
}

function saveSubmissions(submissions) {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(submissions))
  } catch (error) {
    console.warn('[CanvasSubmission] 保存提交恢复记录失败:', error?.message || error)
  }
}

function isFreshSubmission(submission, now = Date.now) {
  const createdAt = Number(submission?.createdAt || 0)
  return createdAt > 0 && nowMs(now) - createdAt <= MAX_SUBMISSION_AGE_MS
}

function pruneSubmissions(submissions, now = Date.now) {
  return (submissions || []).filter(submission => {
    if (!isFreshSubmission(submission, now)) return false
    return !['completed', 'failed'].includes(submission.status)
  })
}

function updateSubmission(submissionId, updater, now = Date.now) {
  const submissions = pruneSubmissions(loadSubmissions(), now)
  const index = submissions.findIndex(item => item.submissionId === submissionId)
  if (index === -1) return null

  const updated = {
    ...submissions[index],
    ...updater(submissions[index]),
    updatedAt: nowMs(now)
  }
  submissions[index] = updated
  saveSubmissions(submissions)
  return updated
}

export function createPendingGenerationSubmission({
  type,
  nodeId,
  tabId = null,
  workflowId = null,
  prompt = '',
  model = '',
  aspectRatio = '',
  duration = '',
  metadata = {},
  now = Date.now
} = {}) {
  const timestamp = nowMs(now)
  const submission = {
    submissionId: createId(now),
    type: truncate(type) || 'video',
    nodeId: truncate(nodeId),
    tabId: truncate(tabId),
    workflowId: truncate(workflowId),
    prompt: truncate(prompt, MAX_TEXT_LENGTH) || '',
    model: truncate(model),
    aspectRatio: truncate(aspectRatio, 32),
    duration: truncate(duration, 16),
    taskId: null,
    status: 'submitting',
    deletedByUser: false,
    metadata,
    createdAt: timestamp,
    updatedAt: timestamp
  }

  const submissions = pruneSubmissions(loadSubmissions(), now)
    .filter(item => item.submissionId !== submission.submissionId)
  submissions.push(submission)
  saveSubmissions(submissions)
  return submission
}

export function getPendingGenerationSubmissions({ type = null, includeDeleted = false, now = Date.now } = {}) {
  const submissions = pruneSubmissions(loadSubmissions(), now)
  const filtered = submissions.filter(submission => {
    if (type && submission.type !== type) return false
    if (!includeDeleted && submission.deletedByUser) return false
    return true
  })
  if (filtered.length !== submissions.length) {
    saveSubmissions(submissions)
  }
  return filtered
}

export function markSubmissionTaskCreated(submissionId, taskId, { now = Date.now } = {}) {
  if (!submissionId || !taskId) return null
  return updateSubmission(submissionId, () => ({
    taskId: String(taskId),
    status: 'task-created'
  }), now)
}

export function removeGenerationSubmission(submissionId, { now = Date.now } = {}) {
  if (!submissionId) return
  const submissions = pruneSubmissions(loadSubmissions(), now)
    .filter(item => item.submissionId !== submissionId)
  saveSubmissions(submissions)
}

export function clearPendingGenerationSubmissions() {
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(STORAGE_KEY)
}

export function markNodeGenerationSubmissionsDeleted(nodeId, { tabId = null, now = Date.now } = {}) {
  if (!nodeId) return 0
  const timestamp = nowMs(now)
  let count = 0
  const submissions = pruneSubmissions(loadSubmissions(), now).map(submission => {
    const sameNode = submission.nodeId === nodeId
    const sameTab = !tabId || !submission.tabId || submission.tabId === tabId
    if (!sameNode || !sameTab) return submission
    count += 1
    return {
      ...submission,
      deletedByUser: true,
      status: 'deleted',
      updatedAt: timestamp
    }
  })
  saveSubmissions(submissions)
  return count
}

function getVideoUrl(task = {}) {
  return task.video_url || task.url || task.qiniu_url || task.output_url || null
}

function isCompleted(status) {
  const normalized = String(status || '').toLowerCase()
  return ['success', 'succeeded', 'completed', 'complete', 'done'].includes(normalized)
}

function isFailed(status) {
  const normalized = String(status || '').toLowerCase()
  return ['failure', 'failed', 'error', 'timeout', 'cancelled', 'canceled'].includes(normalized)
}

function findCanvasNode(canvasStore, nodeId) {
  const activeNode = Array.isArray(canvasStore?.nodes)
    ? canvasStore.nodes.find(node => node?.id === nodeId)
    : null
  if (activeNode) {
    return {
      node: activeNode,
      update: patch => canvasStore.updateNodeData?.(nodeId, patch)
    }
  }

  const inactive = canvasStore?.findInactiveWorkflowTabNode?.(nodeId)
  if (inactive?.node) {
    return {
      node: inactive.node,
      update: patch => canvasStore.updateInactiveWorkflowTabNodeData?.(nodeId, patch)
    }
  }

  return null
}

function getTabId(canvasStore, submission) {
  return submission.tabId || canvasStore?.activeTabId || canvasStore?.getCurrentTab?.()?.id || null
}

export async function recoverPendingCanvasVideoSubmissions({
  canvasStore,
  fetchSubmissionStatus,
  ensureTaskPolling,
  now = Date.now
} = {}) {
  if (!canvasStore || typeof fetchSubmissionStatus !== 'function') {
    return { checked: 0, recovered: 0, completed: 0, failed: 0, notFound: 0, skippedDeleted: 0, missingNode: 0, errors: 0 }
  }

  const result = { checked: 0, recovered: 0, completed: 0, failed: 0, notFound: 0, skippedDeleted: 0, missingNode: 0, errors: 0 }
  const submissions = getPendingGenerationSubmissions({ type: 'video', includeDeleted: true, now })

  for (const submission of submissions) {
    result.checked += 1
    if (submission.deletedByUser || submission.status === 'deleted') {
      removeGenerationSubmission(submission.submissionId, { now })
      result.skippedDeleted += 1
      continue
    }

    const target = findCanvasNode(canvasStore, submission.nodeId)
    if (!target) {
      updateSubmission(submission.submissionId, () => ({
        status: 'waiting-node'
      }), now)
      result.missingNode += 1
      continue
    }

    try {
      const task = await fetchSubmissionStatus(submission.submissionId, submission)
      const taskId = task?.task_id || task?.taskId || task?.id || submission.taskId
      if (!taskId) {
        result.notFound += 1
        continue
      }

      markSubmissionTaskCreated(submission.submissionId, taskId, { now })
      const videoUrl = getVideoUrl(task)
      const status = task?.status

      if (isCompleted(status) && videoUrl) {
        target.update?.({
          status: 'success',
          progress: '100%',
          taskId,
          soraTaskId: taskId,
          output: {
            type: 'video',
            url: videoUrl
          },
          videoUrl,
          completedAt: task.finished_at || task.finishedAt || Date.now()
        })
        removeGenerationSubmission(submission.submissionId, { now })
        result.completed += 1
        continue
      }

      if (isFailed(status)) {
        target.update?.({
          status: 'error',
          progress: null,
          taskId,
          soraTaskId: taskId,
          error: task.fail_reason || task.error || task.message || '视频生成失败'
        })
        removeGenerationSubmission(submission.submissionId, { now })
        result.failed += 1
        continue
      }

      target.update?.({
        status: 'processing',
        progress: task?.progress || '生成中...',
        taskId,
        soraTaskId: taskId,
        taskType: 'video',
        processingStartedAt: target.node?.data?.processingStartedAt || submission.createdAt || Date.now()
      })

      ensureTaskPolling?.({
        taskId,
        type: 'video',
        nodeId: submission.nodeId,
        tabId: getTabId(canvasStore, submission)
      })
      result.recovered += 1
    } catch (error) {
      updateSubmission(submission.submissionId, () => ({
        status: 'recovery-error',
        lastError: String(error?.message || error || 'recover_failed')
      }), now)
      result.errors += 1
    }
  }

  return result
}

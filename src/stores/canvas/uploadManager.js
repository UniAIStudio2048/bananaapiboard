/**
 * 上传管理器 - 后台自动重试失败的文件上传
 * 
 * 解决问题：带宽拥堵、网络不稳定时文件上传失败，
 * 导致生成任务失败且工作流无法保存
 * 
 * 支持类型：图片、视频、音频
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { uploadCanvasMedia } from '@/api/canvas/workflow'

export const useUploadManager = defineStore('uploadManager', () => {
  const pendingUploads = ref(new Map())
  const retryTimers = ref(new Map())
  const MAX_RETRIES = 5
  const BASE_DELAY = 3000

  const failedCount = computed(() => {
    let count = 0
    for (const task of pendingUploads.value.values()) {
      if (task.status === 'failed') count++
    }
    return count
  })

  const uploadingCount = computed(() => {
    let count = 0
    for (const task of pendingUploads.value.values()) {
      if (task.status === 'uploading' || task.status === 'retrying') count++
    }
    return count
  })

  const hasPending = computed(() => pendingUploads.value.size > 0)

  /**
   * 注册一个上传任务（在初次上传失败时调用）
   */
  function registerFailedUpload(taskId, { nodeId, tabId, file, type, blobUrl, field, error }) {
    const existing = pendingUploads.value.get(taskId)
    const retryCount = existing ? existing.retryCount : 0

    pendingUploads.value.set(taskId, {
      taskId,
      nodeId,
      tabId,
      file,
      type,
      blobUrl,
      field,
      error: error || '上传失败',
      status: 'failed',
      retryCount,
      lastAttempt: Date.now(),
      createdAt: existing?.createdAt || Date.now()
    })

    scheduleRetry(taskId)
  }

  /**
   * 安排自动重试
   */
  function scheduleRetry(taskId) {
    if (retryTimers.value.has(taskId)) {
      clearTimeout(retryTimers.value.get(taskId))
    }

    const task = pendingUploads.value.get(taskId)
    if (!task || task.retryCount >= MAX_RETRIES) return

    const delay = BASE_DELAY * Math.pow(2, task.retryCount) + Math.random() * 2000
    console.log(`[UploadManager] 任务 ${taskId} 将在 ${Math.round(delay / 1000)}s 后自动重试 (第 ${task.retryCount + 1} 次)`)

    const timer = setTimeout(() => {
      retryUpload(taskId)
    }, delay)

    retryTimers.value.set(taskId, timer)
  }

  /**
   * 执行重试上传
   */
  async function retryUpload(taskId) {
    const task = pendingUploads.value.get(taskId)
    if (!task || task.status === 'uploading' || task.status === 'success') return

    task.status = 'retrying'
    task.retryCount++
    task.lastAttempt = Date.now()

    console.log(`[UploadManager] 开始重试上传: ${task.type}(${task.file?.name}), 第 ${task.retryCount} 次`)

    try {
      if (!task.file) {
        if (task.blobUrl) {
          try {
            const resp = await fetch(task.blobUrl)
            const blob = await resp.blob()
            task.file = new File([blob], `recovered_${task.type}_${Date.now()}`, { type: blob.type })
          } catch (e) {
            console.error(`[UploadManager] 无法从 blob URL 恢复文件:`, e.message)
            task.status = 'permanently_failed'
            task.error = 'blob URL 已失效，无法重试'
            return
          }
        } else {
          task.status = 'permanently_failed'
          task.error = '文件引用已丢失'
          return
        }
      }

      const result = await uploadCanvasMedia(task.file, task.type, {
        maxRetries: 1,
        baseDelay: 1000,
        nodeId: task.nodeId,
        tabId: task.tabId
      })

      task.status = 'success'
      task.cloudUrl = result.url
      task.uploaded = result
      console.log(`[UploadManager] 重试上传成功: ${result.url}`)

      updateNodeWithCloudUrl(task)
      
      setTimeout(() => {
        pendingUploads.value.delete(taskId)
        retryTimers.value.delete(taskId)
      }, 5000)

    } catch (err) {
      console.error(`[UploadManager] 重试上传失败 (第 ${task.retryCount} 次):`, err.message)
      task.status = 'failed'
      task.error = err.message

      if (task.retryCount < MAX_RETRIES) {
        scheduleRetry(taskId)
      } else {
        task.status = 'permanently_failed'
        console.warn(`[UploadManager] 任务 ${taskId} 已达最大重试次数，停止自动重试`)
      }
    }
  }

  /**
   * 上传成功后更新节点数据
   */
  async function updateNodeWithCloudUrl(task) {
    try {
      const { useCanvasStore } = await import('./canvasStore')
      const canvasStore = useCanvasStore()

      const uploaded = task.uploaded || {
        url: task.cloudUrl,
        status: 'completed',
        uploadId: task.uploadId,
        assetId: task.assetId
      }
      canvasStore.commitMediaUpload({
        nodeId: task.nodeId,
        blobUrl: task.blobUrl,
        mediaType: task.type,
        tabId: task.tabId,
        uploaded
      })
      console.log(`[UploadManager] 节点 ${task.nodeId} 已更新为云存储URL`)
    } catch (e) {
      console.error(`[UploadManager] 更新节点失败:`, e.message)
    }
  }

  /**
   * 手动触发所有失败任务的重试
   */
  function retryAllFailed() {
    for (const [taskId, task] of pendingUploads.value) {
      if (task.status === 'failed' || task.status === 'permanently_failed') {
        task.retryCount = Math.max(0, task.retryCount - 2)
        task.status = 'failed'
        retryUpload(taskId)
      }
    }
  }

  /**
   * 手动重试单个任务
   */
  function retrySingle(taskId) {
    const task = pendingUploads.value.get(taskId)
    if (task) {
      task.status = 'failed'
      retryUpload(taskId)
    }
  }

  /**
   * 清理已完成的任务
   */
  function cleanup() {
    for (const [taskId, task] of pendingUploads.value) {
      if (task.status === 'success') {
        pendingUploads.value.delete(taskId)
      }
    }
  }

  /**
   * 销毁所有定时器
   */
  function destroy() {
    for (const timer of retryTimers.value.values()) {
      clearTimeout(timer)
    }
    retryTimers.value.clear()
  }

  return {
    pendingUploads,
    failedCount,
    uploadingCount,
    hasPending,
    registerFailedUpload,
    retryUpload,
    retryAllFailed,
    retrySingle,
    cleanup,
    destroy
  }
})

/**
 * backgroundTaskManager.js - 后台任务管理器
 * 
 * 功能：
 * - 管理画布节点的后台任务（图片生成、视频生成等）
 * - 任务在后台持续执行，即使用户离开画布也不中断
 * - 任务状态持久化到 localStorage
 * - 用户返回画布时自动恢复任务状态
 */

import { getImageTaskStatus, getVideoTaskStatus, getVideoHdTaskStatus, getImageHdTaskStatus, getImagePanoramaTaskStatus, getRemoveBackgroundTaskStatus, getAudioEditTaskStatus } from '@/api/canvas/nodes'
import { normalizeTaskMediaResult } from '@/utils/canvasTaskResult'
import { withNoChargeNotice } from '@/utils/mediaTaskBillingMessage'
import { getTaskStatusConfig } from './backgroundTaskConfig'
import { classifyBackgroundTaskStatus } from './backgroundTaskStatus'
import { classifyPollingError } from './backgroundTaskErrorPolicy.js'

const STORAGE_KEY = 'canvas_background_tasks'
const POLL_INTERVAL = 3000  // 3秒轮询一次
const MAX_TASK_AGE = 24 * 60 * 60 * 1000  // 任务最大存活时间：24小时
const IMAGE_POLL_TIMEOUT = 8 * 60 * 1000  // 图片任务前端轮询超时：8分钟
const VIDEO_POLL_TIMEOUT = 40 * 60 * 1000  // 视频任务前端轮询超时：40分钟（与后端 VIDEO_TASK_TIMEOUT_MS 对齐）

// 连续网络错误超过该次数（≈5*3s=15s）后，向节点广播 network-error 事件，给用户可见反馈
const NETWORK_ERROR_NOTIFY_AFTER = 5
// 后端返回 success/completed 但仍未拿到 URL 的最大宽限轮询次数（≈8*3s=24s）；超过则视为"已完成但URL丢失"判定 failed
const SUCCESS_NO_URL_GRACE = 8
const HISTORY_MEDIA_TASK_TYPES = new Set([
  'image',
  'video',
  'audio-edit',
  'image-hd',
  'image-panorama',
  'image-cutout',
  'video-hd'
])
const NO_CHARGE_TASK_TYPES = new Set([
  'image',
  'video',
  'image-hd',
  'image-panorama',
  'image-cutout',
  'video-hd',
  'video-hd-upscale'
])

// 内存中的任务状态
let tasks = new Map()
let pollingTimers = new Map()
let taskCallbacks = new Map()

// vite 开发模式 HMR 状态保留：模块热重载时这三个 Map 会被重新初始化为空，
// 导致正在轮询的任务丢失、完成事件不再广播、画布节点不渲染(必须刷新页面才显示)。
// 通过 import.meta.hot.data 在旧模块 dispose 时保存、新模块初始化时恢复，保证 HMR 期间轮询不中断。
if (import.meta.hot) {
  if (import.meta.hot.data) {
    tasks = import.meta.hot.data.tasks || tasks
    pollingTimers = import.meta.hot.data.pollingTimers || pollingTimers
    taskCallbacks = import.meta.hot.data.taskCallbacks || taskCallbacks
  }
  import.meta.hot.dispose((data) => {
    data.tasks = tasks
    data.pollingTimers = pollingTimers
    data.taskCallbacks = taskCallbacks
  })
}

function formatTaskError(task, message, fallback) {
  if (NO_CHARGE_TASK_TYPES.has(task?.type)) {
    return withNoChargeNotice(message, fallback)
  }
  return message || fallback
}

/**
 * 初始化后台任务管理器
 * 从 localStorage 恢复未完成的任务并继续轮询
 */
export function initBackgroundTaskManager() {
  console.log('[BackgroundTaskManager] 初始化')
  loadTasksFromStorage()
  resumePendingTasks()
}

/**
 * 从 localStorage 加载任务
 */
function loadTasksFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return
    
    const savedTasks = JSON.parse(data)
    const now = Date.now()
    
    // 过滤掉过期的任务
    for (const task of savedTasks) {
      if (now - task.createdAt < MAX_TASK_AGE) {
        tasks.set(task.taskId, task)
      }
    }
    
    console.log(`[BackgroundTaskManager] 从存储恢复 ${tasks.size} 个任务`)
  } catch (error) {
    console.error('[BackgroundTaskManager] 加载任务失败:', error)
  }
}

/**
 * 保存任务到 localStorage
 */
function saveTasksToStorage() {
  try {
    const tasksArray = Array.from(tasks.values())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasksArray))
  } catch (error) {
    console.error('[BackgroundTaskManager] 保存任务失败:', error)
  }
}

/**
 * 恢复所有待处理的任务
 */
function resumePendingTasks() {
  for (const [taskId, task] of tasks) {
    if (task.status === 'pending' || task.status === 'processing') {
      console.log(`[BackgroundTaskManager] 恢复任务轮询: ${taskId}`)
      startPolling(taskId)
    }
  }
  saveTasksToStorage()
}

/**
 * 注册一个新任务
 * @param {Object} taskInfo - 任务信息
 * @param {string} taskInfo.taskId - 任务ID
 * @param {string} taskInfo.type - 任务类型 'image' | 'video'
 * @param {string} taskInfo.nodeId - 关联的节点ID
 * @param {string} taskInfo.tabId - 关联的标签ID
 * @param {Object} taskInfo.metadata - 其他元数据
 */
export function registerTask(taskInfo) {
  const { taskId, type, nodeId, tabId, metadata = {} } = taskInfo
  
  const task = {
    taskId,
    type,
    nodeId,
    tabId,
    status: 'pending',
    progress: 0,
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata
  }
  
  tasks.set(taskId, task)
  saveTasksToStorage()
  
  console.log(`[BackgroundTaskManager] 注册任务: ${taskId}, 节点: ${nodeId}`)
  
  // 开始轮询
  startPolling(taskId)
  
  return task
}

/**
 * 确保画布节点关联的后台任务已登记且正在轮询。
 */
export function ensureTaskPolling({ taskId, type, nodeId, tabId }) {
  if (!taskId) return null

  const existingTask = tasks.get(taskId)
  if (existingTask) {
    if (existingTask.status === 'completed' || existingTask.status === 'failed') {
      const forceRefreshTerminal = existingTask.nodeId === nodeId && !pollingTimers.has(taskId)
      if (forceRefreshTerminal) {
        existingTask.status = 'processing'
        existingTask.error = null
        existingTask.updatedAt = Date.now()
        tasks.set(taskId, existingTask)
        saveTasksToStorage()
        startPolling(taskId)
      }
      return existingTask
    }
    if ((existingTask.status === 'pending' || existingTask.status === 'processing') && !pollingTimers.has(taskId)) {
      startPolling(taskId)
    }
    return tasks.get(taskId)
  }

  registerTask({
    taskId,
    type,
    nodeId,
    tabId,
    metadata: {
      restoredFromCanvasNode: true
    }
  })

  return tasks.get(taskId)
}

/**
 * 开始轮询任务状态
 */
function startPolling(taskId) {
  // 如果已经在轮询，不重复开始
  if (pollingTimers.has(taskId)) return
  
  const poll = async () => {
    const task = tasks.get(taskId)
    if (!task) {
      stopPolling(taskId)
      return
    }
    try {
      const taskConfig = getTaskStatusConfig(task.type)
      // 根据任务类型选择对应的状态查询函数
      let getStatus
      if (taskConfig.statusApi === 'video-hd') getStatus = getVideoHdTaskStatus
      else if (taskConfig.statusApi === 'image-hd') getStatus = getImageHdTaskStatus
      else if (taskConfig.statusApi === 'image-panorama') getStatus = getImagePanoramaTaskStatus
      else if (taskConfig.statusApi === 'image-cutout') getStatus = getRemoveBackgroundTaskStatus
      else if (taskConfig.statusApi === 'audio-edit') getStatus = getAudioEditTaskStatus
      else if (taskConfig.statusApi === 'video') getStatus = getVideoTaskStatus
      else getStatus = getImageTaskStatus
      const rawResult = await getStatus(taskId)
      const result = normalizeTaskMediaResult(rawResult, taskConfig.resultType)

      // 网络成功 → 重置连续错误计数，并清除"重试中"提示
      if (task._networkErrorCount) {
        task._networkErrorCount = 0
        notifyTaskNetworkRecovered(taskId, task)
      }

      console.log(`[BackgroundTaskManager] 任务 ${taskId} 状态:`, result.status)
      
      // 更新任务状态
      task.updatedAt = Date.now()
      
      if (result.progress !== undefined) {
        task.progress = result.progress
      }
      
      const classifiedStatus = classifyBackgroundTaskStatus(result, taskConfig.resultType)

      if (classifiedStatus.state === 'completed') {
        task.status = 'completed'
        task.result = result
        
        // 🔥 组图处理：如果 usage 中包含 group_task_ids，获取所有组图的 URL
        console.log(`[BackgroundTaskManager] 检查组图任务 | 任务ID: ${taskId} | usage存在: ${!!result.usage} | usage内容: ${JSON.stringify(result.usage)}`)
        const groupTaskIds = result.usage?.group_task_ids
        console.log(`[BackgroundTaskManager] 组图任务ID检查 | 任务ID: ${taskId} | groupTaskIds: ${groupTaskIds} | 是否为数组: ${Array.isArray(groupTaskIds)} | 长度: ${groupTaskIds?.length || 0} | 任务类型: ${task.type}`)
        if (groupTaskIds && Array.isArray(groupTaskIds) && groupTaskIds.length > 0 && task.type === 'image') {
          console.log(`[BackgroundTaskManager] 检测到组图任务 | 主任务: ${taskId} | 额外图片: ${groupTaskIds.length}张 | groupTaskIds: [${groupTaskIds.join(', ')}]`)
          try {
            const groupUrls = await fetchGroupTaskUrls(groupTaskIds)
            // 将所有组图 URL 附加到 result 中
            task.result._groupImageUrls = groupUrls
            console.log(`[BackgroundTaskManager] 组图URL获取完成 | 主任务: ${taskId} | 成功: ${groupUrls.length}张 | URLs: ${groupUrls.map(g => g.url?.substring(0, 50)).join(', ')}`)
          } catch (groupErr) {
            console.error(`[BackgroundTaskManager] 获取组图URL失败:`, groupErr)
          }
        } else {
          if (!groupTaskIds) {
            console.log(`[BackgroundTaskManager] 组图处理跳过 | 任务ID: ${taskId} | 原因: groupTaskIds不存在`)
          } else if (!Array.isArray(groupTaskIds)) {
            console.warn(`[BackgroundTaskManager] 组图处理跳过 | 任务ID: ${taskId} | 原因: groupTaskIds不是数组 (类型: ${typeof groupTaskIds})`)
          } else if (groupTaskIds.length === 0) {
            console.log(`[BackgroundTaskManager] 组图处理跳过 | 任务ID: ${taskId} | 原因: groupTaskIds为空数组`)
          } else if (task.type !== 'image') {
            console.log(`[BackgroundTaskManager] 组图处理跳过 | 任务ID: ${taskId} | 原因: 任务类型不是image (${task.type})`)
          }
        }
        
        stopPolling(taskId)
        notifyTaskComplete(taskId, task)
        console.log(`[BackgroundTaskManager] 任务完成: ${taskId}`, result)
      } else if (classifiedStatus.state === 'failed') {
        task.status = 'failed'
        task.error = formatTaskError(task, classifiedStatus.error, '任务执行失败')
        task.result = result
        stopPolling(taskId)
        notifyTaskFailed(taskId, task)
        console.log(`[BackgroundTaskManager] 任务失败: ${taskId} | 状态: ${result.status || 'unknown'} | 错误: ${task.error}`)
      } else if (classifiedStatus.waitingForUrl) {
        // 后端返回 success/completed 但 URL 尚未落库：累计宽限次数，超阈值才 failed。
        // 这避免了"实际已生成、URL 几秒后才到"被错判失败导致节点空白。
        task._successNoUrlCount = (task._successNoUrlCount || 0) + 1
        task.status = 'processing'
        if (task._successNoUrlCount >= SUCCESS_NO_URL_GRACE) {
          task.status = 'failed'
          task.error = formatTaskError(task, classifiedStatus.error, '任务执行失败')
          task.result = result
          stopPolling(taskId)
          notifyTaskFailed(taskId, task)
          console.warn(`[BackgroundTaskManager] 任务 ${taskId} 后端 success 但 URL 始终为空，宽限耗尽判失败`)
        } else {
          console.log(`[BackgroundTaskManager] 任务 ${taskId} success 但缺 URL，等待中 (${task._successNoUrlCount}/${SUCCESS_NO_URL_GRACE})`)
        }
      } else {
        const pollTimeout = taskConfig.longRunning
          ? VIDEO_POLL_TIMEOUT : IMAGE_POLL_TIMEOUT
        const taskAge = Date.now() - task.createdAt
        if (taskAge > pollTimeout) {
          const minutes = Math.round(taskAge / 60000)
          console.log(`[BackgroundTaskManager] 任务 ${taskId} 后端仍处理中且前端超时 (${minutes}分钟), 标记为失败`)
          task.status = 'failed'
          task.error = formatTaskError(task, `任务超时（${minutes}分钟），请重试`, '任务超时，请重试')
          task.result = result
          stopPolling(taskId)
          notifyTaskFailed(taskId, task)
        } else {
          // 正常 processing，重置宽限计数（避免 success → processing → success 序列错误累计）
          task._successNoUrlCount = 0
          task.status = 'processing'
        }
      }
      
      // 只对进行中的任务更新状态和通知进度
      // 已完成/失败的任务由事件处理器决定是否移除
      if (task.status === 'processing' || task.status === 'pending') {
        tasks.set(taskId, task)
        saveTasksToStorage()
        notifyTaskProgress(taskId, task)
      } else {
        // 完成/失败的任务也保存一次（供恢复使用），但不发送进度通知
        if (tasks.has(taskId)) {
          tasks.set(taskId, task)
          saveTasksToStorage()
        }
      }
      
    } catch (error) {
      console.error(`[BackgroundTaskManager] 轮询任务 ${taskId} 出错:`, error)

      const message = String(error?.message || '')

      const pollingErrorAction = classifyPollingError(task, error)

      if (pollingErrorAction.kind === 'pause') {
        task.status = pollingErrorAction.status
        task.error = null
        task._networkErrorCount = NETWORK_ERROR_NOTIFY_AFTER
        task._pausedByIdentityMismatch = true
        task.updatedAt = Date.now()
        tasks.set(taskId, task)
        saveTasksToStorage()
        stopPolling(taskId)
        notifyTaskNetworkError(taskId, task, pollingErrorAction.message)
        console.warn(`[BackgroundTaskManager] 任务 ${taskId} 查询身份不匹配，已暂停轮询并保留重新获取入口`)
        return
      }

      // 如果任务不存在（404错误），标记为失败并停止轮询
      if (pollingErrorAction.kind === 'failed') {
        task.status = 'failed'
        task.error = formatTaskError(task, pollingErrorAction.message, '任务不存在或已过期，请重新生成')
        task.updatedAt = Date.now()
        tasks.set(taskId, task)
        saveTasksToStorage()
        stopPolling(taskId)
        notifyTaskFailed(taskId, task)
        console.log(`[BackgroundTaskManager] 任务 ${taskId} 不存在，已停止轮询`)
        return
      }

      // 401 / 会话过期：继续静默重试只会让节点一直转，停止轮询并给出明确提示，
      // 让用户去登录而不是干等到 8/40 分钟超时。
      const isAuthError = error?.status === 401 ||
        message.includes('401') ||
        message.includes('Unauthorized') ||
        message.includes('未登录') ||
        message.includes('登录已过期') ||
        message.includes('会话已过期')
      if (isAuthError) {
        task.status = 'failed'
        task.error = formatTaskError(task, '登录已过期，请刷新页面重新登录后再生成', '登录已过期，请刷新页面')
        task.updatedAt = Date.now()
        tasks.set(taskId, task)
        saveTasksToStorage()
        stopPolling(taskId)
        notifyTaskFailed(taskId, task)
        console.warn(`[BackgroundTaskManager] 任务 ${taskId} 401，已停止轮询`)
        return
      }

      // 网络错误（Failed to fetch / NetworkError / 5xx 等）：累计连续失败次数；
      // 累计达到阈值后向节点广播 network-error 事件，让节点显示"网络异常，重试中..."而不是一直 loading。
      // 注意：不直接把任务置为 failed，后台任务可能仍在跑；恢复后由 reset 流程清掉提示。
      const isNetworkError = message.includes('Failed to fetch') ||
        message.includes('NetworkError') ||
        message.includes('network') ||
        /^\d{3}$/.test(message) ||
        message.includes('查询任务状态失败')

      task._networkErrorCount = (task._networkErrorCount || 0) + 1
      task.updatedAt = Date.now()

      if (isNetworkError && task._networkErrorCount >= NETWORK_ERROR_NOTIFY_AFTER) {
        notifyTaskNetworkError(taskId, task, message || '网络连接异常')
      }

      // 不停止轮询，下次 setInterval 继续重试
    }
  }
  
  // 立即执行一次
  poll()
  
  // 设置定时器
  const timer = setInterval(poll, POLL_INTERVAL)
  pollingTimers.set(taskId, timer)
}

/**
 * 停止轮询
 */
function stopPolling(taskId) {
  const timer = pollingTimers.get(taskId)
  if (timer) {
    clearInterval(timer)
    pollingTimers.delete(taskId)
  }
}

/**
 * 注册任务回调
 * @param {string} taskId - 任务ID
 * @param {Object} callbacks - 回调函数
 * @param {Function} callbacks.onProgress - 进度回调
 * @param {Function} callbacks.onComplete - 完成回调
 * @param {Function} callbacks.onError - 错误回调
 */
export function subscribeTask(taskId, callbacks) {
  taskCallbacks.set(taskId, callbacks)
  
  // 如果任务已经完成，立即回调
  const task = tasks.get(taskId)
  if (task) {
    if (task.status === 'completed' && callbacks.onComplete) {
      callbacks.onComplete(task)
    } else if (task.status === 'failed' && callbacks.onError) {
      callbacks.onError(task)
    }
  }
}

/**
 * 取消任务订阅
 */
export function unsubscribeTask(taskId) {
  taskCallbacks.delete(taskId)
}

/**
 * 通知任务进度
 */
function notifyTaskProgress(taskId, task) {
  const callbacks = taskCallbacks.get(taskId)
  if (callbacks?.onProgress) {
    callbacks.onProgress(task)
  }
  
  // 广播事件
  window.dispatchEvent(new CustomEvent('background-task-progress', {
    detail: { taskId, task }
  }))
}

/**
 * 通知任务完成
 */
function notifyTaskComplete(taskId, task) {
  const callbacks = taskCallbacks.get(taskId)
  if (callbacks?.onComplete) {
    callbacks.onComplete(task)
  }
  
  // 广播事件
  window.dispatchEvent(new CustomEvent('background-task-complete', {
    detail: { taskId, task }
  }))

  // 生成任务一旦提交就不可撤销；即使关联画布节点后来被删除/撤销，
  // 完成结果仍应进入服务端历史，通知历史面板重新拉取。
  if (HISTORY_MEDIA_TASK_TYPES.has(task.type)) {
    window.dispatchEvent(new CustomEvent('canvas-history-invalidate', {
      detail: { taskId, task }
    }))
  }
}

/**
 * 通知任务网络错误（轮询失败累计达到阈值时）
 * 节点应显示"网络异常，重试中..."等可见反馈，而不是一直转 loading
 */
function notifyTaskNetworkError(taskId, task, message) {
  window.dispatchEvent(new CustomEvent('background-task-network-error', {
    detail: {
      taskId,
      task,
      message: message || '网络连接异常',
      consecutiveErrors: task._networkErrorCount || 0
    }
  }))
}

/**
 * 通知任务网络已恢复（轮询再次成功，清除"重试中"提示）
 */
function notifyTaskNetworkRecovered(taskId, task) {
  window.dispatchEvent(new CustomEvent('background-task-network-recovered', {
    detail: { taskId, task }
  }))
}

/**
 * 通知任务失败
 */
function notifyTaskFailed(taskId, task) {
  const callbacks = taskCallbacks.get(taskId)
  if (callbacks?.onError) {
    callbacks.onError(task)
  }
  
  // 广播事件
  window.dispatchEvent(new CustomEvent('background-task-failed', {
    detail: { taskId, task }
  }))
}

/**
 * 获取节点的所有任务
 */
export function getTasksByNodeId(nodeId) {
  const result = []
  for (const task of tasks.values()) {
    if (task.nodeId === nodeId) {
      result.push(task)
    }
  }
  return result
}

/**
 * 获取标签的所有任务
 */
export function getTasksByTabId(tabId) {
  const result = []
  for (const task of tasks.values()) {
    if (task.tabId === tabId) {
      result.push(task)
    }
  }
  return result
}

/**
 * 获取所有待处理的任务
 */
export function getPendingTasks() {
  const result = []
  for (const task of tasks.values()) {
    if (task.status === 'pending' || task.status === 'processing') {
      result.push(task)
    }
  }
  return result
}

/**
 * 获取任务
 */
export function getTask(taskId) {
  return tasks.get(taskId)
}

/**
 * 移除已完成的任务
 */
export function removeCompletedTask(taskId) {
  const task = tasks.get(taskId)
  if (task && (task.status === 'completed' || task.status === 'failed')) {
    tasks.delete(taskId)
    taskCallbacks.delete(taskId)
    saveTasksToStorage()
  }
}

/**
 * 清理所有已完成的任务
 */
export function clearCompletedTasks() {
  for (const [taskId, task] of tasks) {
    if (task.status === 'completed' || task.status === 'failed') {
      tasks.delete(taskId)
      taskCallbacks.delete(taskId)
    }
  }
  saveTasksToStorage()
}

/**
 * 停止所有轮询（页面卸载时调用）
 */
export function stopAllPolling() {
  for (const timer of pollingTimers.values()) {
    clearInterval(timer)
  }
  pollingTimers.clear()
}

/**
 * 获取任务统计
 */
export function getTaskStats() {
  let pending = 0
  let processing = 0
  let completed = 0
  let failed = 0
  
  for (const task of tasks.values()) {
    switch (task.status) {
      case 'pending': pending++; break
      case 'processing': processing++; break
      case 'completed': completed++; break
      case 'failed': failed++; break
    }
  }
  
  return { pending, processing, completed, failed, total: tasks.size }
}

/**
 * 🔥 获取组图任务的所有图片URL
 * @param {string[]}groupTaskIds - 组图子任务ID列表
 * @returns {Promise<Array<{taskId: string, url: string}>>}
 */
async function fetchGroupTaskUrls(groupTaskIds) {
  console.log(`[BackgroundTaskManager] 开始获取组图URL | groupTaskIds: [${groupTaskIds.join(', ')}] | 数量: ${groupTaskIds.length}`)
  const results = []
  for (let i = 0; i < groupTaskIds.length; i++) {
    const gTaskId = groupTaskIds[i]
    console.log(`[BackgroundTaskManager] 获取组图子任务 ${i + 1}/${groupTaskIds.length} | 任务ID: ${gTaskId}`)
    try {
      const result = await getImageTaskStatus(gTaskId)
      console.log(`[BackgroundTaskManager] 组图子任务状态 | 任务ID: ${gTaskId} | 状态: ${result.status} | URL存在: ${!!result.url} | URL: ${result.url?.substring(0, 50)}...`)
      if (result.url) {
        results.push({ taskId: gTaskId, url: result.url })
        console.log(`[BackgroundTaskManager] 组图子任务URL已添加 | 任务ID: ${gTaskId} | 当前结果数: ${results.length}`)
      } else {
        console.warn(`[BackgroundTaskManager] 组图子任务无URL | 任务ID: ${gTaskId} | 状态: ${result.status}`)
      }
    }catch (err) {
      console.error(`[BackgroundTaskManager] 获取组图子任务 ${gTaskId} 失败:`, err.message, err.stack)
    }
  }
  console.log(`[BackgroundTaskManager] 组图URL获取完成 | 总数: ${groupTaskIds.length} | 成功: ${results.length} | 结果: ${results.map(r => r.taskId).join(', ')}`)
  return results
}

// 页面卸载前保存状态并停止轮询
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    saveTasksToStorage()
    stopAllPolling()  // 🔧 确保停止所有轮询定时器
  })
}

/**
 * 🔧 清理所有资源（组件卸载时调用）
 */
export function cleanup() {
  stopAllPolling()
  taskCallbacks.clear()
  console.log('[BackgroundTaskManager] 已清理所有资源')
}

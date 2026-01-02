/**
 * backgroundTaskManager.js - 后台任务管理器
 * 
 * 功能：
 * - 管理画布节点的后台任务（图片生成、视频生成等）
 * - 任务在后台持续执行，即使用户离开画布也不中断
 * - 任务状态持久化到 localStorage
 * - 用户返回画布时自动恢复任务状态
 */

import { getImageTaskStatus, getVideoTaskStatus, getVideoHdTaskStatus } from '@/api/canvas/nodes'

const STORAGE_KEY = 'canvas_background_tasks'
const POLL_INTERVAL = 3000  // 3秒轮询一次
const MAX_TASK_AGE = 24 * 60 * 60 * 1000  // 任务最大存活时间：24小时

// 内存中的任务状态
let tasks = new Map()
let pollingTimers = new Map()
let taskCallbacks = new Map()

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
      // 根据任务类型选择对应的状态查询函数
      let getStatus
      if (task.type === 'video-hd-upscale' || task.type === 'video-hd') {
        getStatus = getVideoHdTaskStatus
      } else if (task.type === 'video') {
        getStatus = getVideoTaskStatus
      } else {
        getStatus = getImageTaskStatus
      }
      const result = await getStatus(taskId)
      
      console.log(`[BackgroundTaskManager] 任务 ${taskId} 状态:`, result.status)
      
      // 更新任务状态
      task.updatedAt = Date.now()
      
      if (result.progress !== undefined) {
        task.progress = result.progress
      }
      
      // 检查是否完成（支持大小写状态）
      const statusLower = (result.status || '').toLowerCase()
      if (statusLower === 'completed' || statusLower === 'success' || result.url || result.video_url) {
        task.status = 'completed'
        task.result = result
        stopPolling(taskId)
        notifyTaskComplete(taskId, task)
        console.log(`[BackgroundTaskManager] 任务完成: ${taskId}`)
      } else if (statusLower === 'failed' || statusLower === 'error' || statusLower === 'failure') {
        task.status = 'failed'
        task.error = result.error || result.fail_reason || '任务执行失败'
        stopPolling(taskId)
        notifyTaskFailed(taskId, task)
        console.log(`[BackgroundTaskManager] 任务失败: ${taskId}`)
      } else {
        task.status = 'processing'
      }
      
      tasks.set(taskId, task)
      saveTasksToStorage()
      
      // 通知进度更新
      notifyTaskProgress(taskId, task)
      
    } catch (error) {
      console.error(`[BackgroundTaskManager] 轮询任务 ${taskId} 出错:`, error)
      // 出错时不停止轮询，继续尝试
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

// 页面卸载前保存状态
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    saveTasksToStorage()
  })
}


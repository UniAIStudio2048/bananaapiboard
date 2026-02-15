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
      // 高清任务返回 outputUrl，普通任务返回 url 或 video_url
      const hasOutput = result.url || result.video_url || result.outputUrl
      if (statusLower === 'completed' || statusLower === 'success' || hasOutput) {
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
      } else if (statusLower === 'failed' || statusLower === 'error' || statusLower === 'failure' || statusLower === 'timeout') {
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
      
      // 如果任务不存在（404错误），标记为失败并停止轮询
      if (error.message?.includes('任务不存在') || error.message?.includes('not found')) {
        task.status = 'failed'
        task.error = '任务不存在或已过期，请重新生成'
        task.updatedAt = Date.now()
        tasks.set(taskId, task)
        saveTasksToStorage()
        stopPolling(taskId)
        notifyTaskFailed(taskId, task)
        console.log(`[BackgroundTaskManager] 任务 ${taskId} 不存在，已停止轮询`)
        return
      }
      // 其他错误继续尝试轮询
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


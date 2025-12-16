/**
 * workflowAutoSave.js - 工作流自动保存服务
 * 
 * 功能：
 * - 每1分钟自动保存当前工作流到 localStorage
 * - 缓存有效期为1天，自动清理过期记录
 * - 不存数据库，只做本地临时缓存
 * - 用于用户不小心关闭浏览器时恢复工作流
 */

const STORAGE_KEY = 'workflow_auto_saves'
const MAX_HISTORY_COUNT = 20  // 最多保存20条历史记录
const CACHE_DURATION = 24 * 60 * 60 * 1000  // 1天（毫秒）
const AUTO_SAVE_INTERVAL = 60 * 1000  // 1分钟（毫秒）

let autoSaveTimer = null

/**
 * 获取所有历史工作流
 */
export function getWorkflowHistory() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    
    const history = JSON.parse(data)
    
    // 过滤掉过期的记录
    const now = Date.now()
    const validHistory = history.filter(item => {
      const age = now - item.savedAt
      return age < CACHE_DURATION
    })
    
    // 如果有过期记录被清理，更新存储
    if (validHistory.length !== history.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validHistory))
    }
    
    // 按时间倒序排列（最新的在前）
    return validHistory.sort((a, b) => b.savedAt - a.savedAt)
  } catch (error) {
    console.error('[WorkflowAutoSave] 读取历史失败:', error)
    return []
  }
}

/**
 * 保存工作流到历史记录
 * @param {Object} workflow - 工作流数据 { name, nodes, edges, viewport, tabId }
 */
export function saveWorkflowToHistory(workflow) {
  if (!workflow || !workflow.nodes || workflow.nodes.length === 0) {
    return false
  }
  
  try {
    const history = getWorkflowHistory()
    
    // 生成唯一ID
    const historyId = `history-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    
    // 创建历史记录
    const historyItem = {
      id: historyId,
      name: workflow.name || '未命名工作流',
      tabId: workflow.tabId || null,
      workflowId: workflow.workflowId || null,  // 原始工作流ID（如果是已保存的工作流）
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges?.length || 0,
      nodes: JSON.parse(JSON.stringify(workflow.nodes)),
      edges: JSON.parse(JSON.stringify(workflow.edges || [])),
      viewport: workflow.viewport ? { ...workflow.viewport } : { x: 0, y: 0, zoom: 1 },
      savedAt: Date.now()
    }
    
    // 检查是否有相同 tabId 的最近记录，避免重复保存相同内容
    if (workflow.tabId) {
      const recentSameTab = history.find(h => 
        h.tabId === workflow.tabId && 
        Date.now() - h.savedAt < 30000  // 30秒内的同一标签不重复保存
      )
      
      if (recentSameTab) {
        // 检查内容是否有变化
        const oldHash = generateSimpleHash(recentSameTab.nodes)
        const newHash = generateSimpleHash(workflow.nodes)
        
        if (oldHash === newHash) {
          console.log('[WorkflowAutoSave] 内容无变化，跳过保存')
          return false
        }
      }
    }
    
    // 添加到历史记录开头
    history.unshift(historyItem)
    
    // 限制历史记录数量
    while (history.length > MAX_HISTORY_COUNT) {
      history.pop()
    }
    
    // 保存到 localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    
    console.log('[WorkflowAutoSave] 已保存工作流:', historyItem.name, '节点数:', historyItem.nodeCount)
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 保存失败:', error)
    return false
  }
}

/**
 * 生成简单的内容哈希（用于比较内容是否变化）
 */
function generateSimpleHash(nodes) {
  if (!nodes || nodes.length === 0) return ''
  
  // 只比较节点数量和位置信息
  return nodes.map(n => `${n.id}:${n.position?.x || 0},${n.position?.y || 0}`).join('|')
}

/**
 * 删除指定的历史记录
 * @param {String} historyId - 历史记录ID
 */
export function deleteWorkflowHistory(historyId) {
  try {
    const history = getWorkflowHistory()
    const newHistory = history.filter(h => h.id !== historyId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
    console.log('[WorkflowAutoSave] 已删除历史记录:', historyId)
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 删除失败:', error)
    return false
  }
}

/**
 * 清空所有历史记录
 */
export function clearWorkflowHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('[WorkflowAutoSave] 已清空所有历史记录')
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 清空失败:', error)
    return false
  }
}

/**
 * 获取指定ID的历史工作流
 * @param {String} historyId - 历史记录ID
 */
export function getWorkflowHistoryById(historyId) {
  const history = getWorkflowHistory()
  return history.find(h => h.id === historyId) || null
}

/**
 * 启动自动保存服务
 * @param {Function} getWorkflowData - 获取当前工作流数据的函数
 */
export function startAutoSave(getWorkflowData) {
  stopAutoSave()  // 先停止之前的定时器
  
  console.log('[WorkflowAutoSave] 启动自动保存服务，间隔:', AUTO_SAVE_INTERVAL / 1000, '秒')
  
  autoSaveTimer = setInterval(() => {
    try {
      const workflowData = getWorkflowData()
      if (workflowData && workflowData.nodes && workflowData.nodes.length > 0) {
        saveWorkflowToHistory(workflowData)
      }
    } catch (error) {
      console.error('[WorkflowAutoSave] 自动保存出错:', error)
    }
  }, AUTO_SAVE_INTERVAL)
}

/**
 * 停止自动保存服务
 */
export function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
    console.log('[WorkflowAutoSave] 已停止自动保存服务')
  }
}

/**
 * 手动触发一次保存（用于关闭页面前等场景）
 * @param {Object} workflow - 工作流数据
 */
export function manualSave(workflow) {
  return saveWorkflowToHistory(workflow)
}

/**
 * 格式化保存时间
 * @param {Number} timestamp - 时间戳
 */
export function formatSaveTime(timestamp) {
  if (!timestamp) return '-'
  
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 获取历史记录数量
 */
export function getHistoryCount() {
  return getWorkflowHistory().length
}


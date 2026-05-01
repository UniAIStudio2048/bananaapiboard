/**
 * workflowAutoSave.js - 工作流自动保存服务
 * 
 * 功能：
 * - 每1分钟自动保存当前工作流到 localStorage
 * - 缓存有效期为1天，自动清理过期记录
 * - 不存数据库，只做本地临时缓存
 * - 用于用户不小心关闭浏览器时恢复工作流
 * 
 * 🔧 安全保护：
 * - 自动清理节点中的 base64 大数据，避免撑爆 localStorage
 * - 单个工作流限制 300KB，总存储限制 3MB
 * - QuotaExceededError 自动处理
 */

const STORAGE_KEY = 'workflow_auto_saves'
const SESSION_STORAGE_KEY = 'workflow_tab_session'
const MAX_HISTORY_COUNT = 20  // 最多保存20条历史记录
const CACHE_DURATION = 24 * 60 * 60 * 1000  // 1天（毫秒）
const SESSION_RESTORE_DURATION = 10 * 60 * 1000  // 10分钟内的标签会话用于刷新恢复
const AUTO_SAVE_INTERVAL = 60 * 1000  // 1分钟（毫秒）
const MAX_SINGLE_WORKFLOW_SIZE = 300 * 1024  // 单个工作流最大 300KB
const MAX_TOTAL_STORAGE_SIZE = 3 * 1024 * 1024  // 总存储最大 3MB
const MAX_SESSION_STORAGE_SIZE = 2 * 1024 * 1024  // 标签会话最大 2MB

let autoSaveTimer = null

function parseStoredJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeHistoryItem(item) {
  const nodes = parseStoredJson(item.nodes, [])
  const edges = parseStoredJson(item.edges, [])
  const viewport = parseStoredJson(item.viewport, { x: 0, y: 0, zoom: 1 })

  return {
    ...item,
    nodes: Array.isArray(nodes) ? nodes : [],
    edges: Array.isArray(edges) ? edges : [],
    viewport: viewport && typeof viewport === 'object' && !Array.isArray(viewport)
      ? viewport
      : { x: 0, y: 0, zoom: 1 }
  }
}

/**
 * 🔧 清理节点中的大数据（base64图片、blob URL等），只保留结构和有效URL引用
 * 这样可以大幅减少存储空间，避免 localStorage 溢出
 * 
 * 清理规则：
 * - base64 数据：移除，只保留类型标记
 * - blob URL：移除（localStorage 恢复后无效）
 * - 超大字符串：截断
 */
function cleanNodeData(nodes) {
  if (!Array.isArray(nodes)) return nodes
  
  return nodes.map(node => {
    // 深拷贝节点
    let cleanedNode
    try {
      cleanedNode = JSON.parse(JSON.stringify(node))
    } catch (e) {
      // 如果 JSON 序列化失败（可能有循环引用），跳过这个节点
      console.warn('[WorkflowAutoSave] 节点序列化失败，跳过:', node.id, e.message)
      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: { title: node.data?.title || 'Error Node', _serializeError: true }
      }
    }
    
    if (cleanedNode.data) {
      // 清理常见的大数据字段（base64图片）
      const fieldsToClean = ['imageData', 'base64', 'thumbnail', 'previewData', 'originalData']
      fieldsToClean.forEach(field => {
        if (cleanedNode.data[field] && typeof cleanedNode.data[field] === 'string') {
          // 如果是 base64 数据，只保留类型标记
          if (cleanedNode.data[field].startsWith('data:')) {
            const mimeMatch = cleanedNode.data[field].match(/^data:([^;,]+)/)
            cleanedNode.data[field] = mimeMatch ? `[BASE64:${mimeMatch[1]}]` : '[BASE64_REMOVED]'
          } else if (cleanedNode.data[field].startsWith('blob:')) {
            // 🔧 清理 blob URL（localStorage 恢复后无效）
            cleanedNode.data[field] = '[BLOB_URL_REMOVED]'
          } else if (cleanedNode.data[field].length > 10000) {
            // 超过 10KB 的字符串数据也清理
            cleanedNode.data[field] = '[LARGE_DATA_REMOVED]'
          }
        }
      })
      
      // 清理 images 数组中的 base64 数据和 blob URL
      if (Array.isArray(cleanedNode.data.images)) {
        cleanedNode.data.images = cleanedNode.data.images.map(img => {
          const cleanedImg = { ...img }
          // 保留有效 URL，移除 base64 和 blob
          if (cleanedImg.base64) delete cleanedImg.base64
          if (cleanedImg.data && typeof cleanedImg.data === 'string') {
            if (cleanedImg.data.startsWith('data:') || cleanedImg.data.startsWith('blob:')) {
              delete cleanedImg.data
            }
          }
          if (cleanedImg.thumbnail && typeof cleanedImg.thumbnail === 'string') {
            if (cleanedImg.thumbnail.startsWith('data:') || cleanedImg.thumbnail.startsWith('blob:')) {
              delete cleanedImg.thumbnail
            }
          }
          // 清理 url 字段中的 blob URL
          if (cleanedImg.url && cleanedImg.url.startsWith('blob:')) {
            delete cleanedImg.url
          }
          return cleanedImg
        }).filter(img => img.url || img.src) // 移除没有有效 URL 的图片
      }
      
      // 🔧 清理 sourceImages 数组中的 blob URL
      if (Array.isArray(cleanedNode.data.sourceImages)) {
        cleanedNode.data.sourceImages = cleanedNode.data.sourceImages.filter(url => {
          if (typeof url === 'string') {
            return !url.startsWith('blob:') && !url.startsWith('data:')
          }
          return true
        })
      }
      
      // 清理 imageUrl/videoUrl 等字段中的 base64 和 blob URL（保留 http URL）
      const urlFields = ['imageUrl', 'videoUrl', 'url', 'image', 'video', 'audioUrl', 'src']
      urlFields.forEach(field => {
        if (cleanedNode.data[field] && typeof cleanedNode.data[field] === 'string') {
          if (cleanedNode.data[field].startsWith('data:')) {
            const mimeMatch = cleanedNode.data[field].match(/^data:([^;,]+)/)
            cleanedNode.data[field] = mimeMatch ? `[BASE64:${mimeMatch[1]}]` : '[BASE64_REMOVED]'
          } else if (cleanedNode.data[field].startsWith('blob:')) {
            cleanedNode.data[field] = '[BLOB_URL_REMOVED]'
          }
        }
      })
      
      // 清理 result/output 等可能包含大数据的字段
      const resultFields = ['result', 'response', 'content']
      resultFields.forEach(field => {
        if (cleanedNode.data[field] && typeof cleanedNode.data[field] === 'string') {
          if (cleanedNode.data[field].startsWith('data:')) {
            cleanedNode.data[field] = '[BASE64_REMOVED]'
          } else if (cleanedNode.data[field].startsWith('blob:')) {
            cleanedNode.data[field] = '[BLOB_URL_REMOVED]'
          } else if (cleanedNode.data[field].length > 50000) {
            // 超过 50KB 的文本内容截断
            cleanedNode.data[field] = cleanedNode.data[field].substring(0, 1000) + '...[TRUNCATED]'
          }
        }
      })
      
      // 🔧 特殊处理 output 对象（可能包含 urls 数组）
      if (cleanedNode.data.output && typeof cleanedNode.data.output === 'object') {
        // 清理 output.url
        if (cleanedNode.data.output.url) {
          if (cleanedNode.data.output.url.startsWith('blob:') || cleanedNode.data.output.url.startsWith('data:')) {
            cleanedNode.data.output.url = null
          }
        }
        // 清理 output.urls 数组
        if (Array.isArray(cleanedNode.data.output.urls)) {
          cleanedNode.data.output.urls = cleanedNode.data.output.urls.filter(url => {
            if (typeof url === 'string') {
              return !url.startsWith('blob:') && !url.startsWith('data:')
            }
            return true
          })
        }
      }

      if (cleanedNode.data.editSession && typeof cleanedNode.data.editSession === 'object') {
        cleanedNode.data.editSession = { ...cleanedNode.data.editSession }
        if (Array.isArray(cleanedNode.data.editSession.history)) {
          cleanedNode.data.editSession.history = cleanedNode.data.editSession.history
            .map(entry => ({ ...entry }))
            .filter(entry => {
              const snapshotUrl = entry.snapshotUrl || entry.imageData
              if (typeof snapshotUrl !== 'string') return false
              return !snapshotUrl.startsWith('blob:') && !snapshotUrl.startsWith('data:')
            })
        }

        if (
          typeof cleanedNode.data.editSession.historyIndex === 'number' &&
          Array.isArray(cleanedNode.data.editSession.history)
        ) {
          const maxIndex = Math.max(0, cleanedNode.data.editSession.history.length - 1)
          cleanedNode.data.editSession.historyIndex = Math.min(
            Math.max(0, cleanedNode.data.editSession.historyIndex),
            maxIndex
          )
        }
      }
    }
    
    return cleanedNode
  })
}

/**
 * 🔧 安全地保存到 localStorage，处理容量溢出
 */
function saveToLocalStorage(history) {
  try {
    const jsonData = JSON.stringify(history)
    
    // 检查总大小
    if (jsonData.length > MAX_TOTAL_STORAGE_SIZE) {
      console.warn(`[WorkflowAutoSave] 数据过大 (${(jsonData.length / 1024 / 1024).toFixed(2)}MB)，清理旧记录`)
      // 逐步删除旧记录直到大小合适
      while (history.length > 1) {
        history.pop()
        const newJson = JSON.stringify(history)
        if (newJson.length <= MAX_TOTAL_STORAGE_SIZE) {
          break
        }
      }
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    return true
  } catch (e) {
    // 处理 QuotaExceededError
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      console.warn('[WorkflowAutoSave] localStorage 空间不足，清理旧记录')
      
      // 删除一半记录后重试
      const reducedHistory = history.slice(0, Math.max(1, Math.floor(history.length / 2)))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedHistory))
        console.log('[WorkflowAutoSave] 清理后保存成功，剩余记录数:', reducedHistory.length)
        return true
      } catch (e2) {
        console.error('[WorkflowAutoSave] 清理后仍无法保存，清空所有历史')
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch (e3) {
          // 忽略
        }
        return false
      }
    }
    console.error('[WorkflowAutoSave] 保存失败:', e)
    return false
  }
}

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
      saveToLocalStorage(validHistory)
    }
    
    // 按时间倒序排列（最新的在前），并兼容旧版本把 nodes/edges/viewport 存为字符串的记录
    return validHistory
      .map(normalizeHistoryItem)
      .sort((a, b) => b.savedAt - a.savedAt)
  } catch (error) {
    console.error('[WorkflowAutoSave] 读取历史失败:', error)
    return []
  }
}

/**
 * 保存当前多标签会话，用于页面刷新后恢复左上角打开的工作流标签
 * @param {Object} session - { tabs, activeTabId }
 */
export function saveWorkflowSession(session) {
  if (!session || !Array.isArray(session.tabs) || session.tabs.length === 0) {
    return false
  }

  try {
    const tabs = session.tabs.slice(0, 10).map(tab => {
      const cleanedNodes = cleanNodeData(tab.nodes || [])
      const cleanedEdges = JSON.parse(JSON.stringify(tab.edges || []))
      return {
        id: tab.id,
        name: tab.name || '未命名工作流',
        description: tab.description || '',
        workflowId: tab.workflowId || null,
        workflowUid: tab.workflowUid || null,
        workflowSpaceType: tab.workflowSpaceType || null,
        workflowTeamId: tab.workflowTeamId || null,
        nodes: cleanedNodes,
        edges: cleanedEdges,
        viewport: tab.viewport ? { ...tab.viewport } : { x: 0, y: 0, zoom: 1 },
        hasChanges: !!tab.hasChanges
      }
    })

    const payload = {
      tabs,
      activeTabId: tabs.some(tab => tab.id === session.activeTabId) ? session.activeTabId : tabs[0]?.id,
      savedAt: Date.now()
    }

    const jsonData = JSON.stringify(payload)
    if (jsonData.length > MAX_SESSION_STORAGE_SIZE) {
      console.warn(`[WorkflowAutoSave] 标签会话过大 (${(jsonData.length / 1024).toFixed(1)}KB)，跳过保存`)
      return false
    }

    localStorage.setItem(SESSION_STORAGE_KEY, jsonData)
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 保存标签会话失败:', error)
    return false
  }
}

/**
 * 读取最近的多标签会话。过期或无效会话会自动清理。
 */
export function getWorkflowSession() {
  try {
    const data = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!data) return null

    const session = JSON.parse(data)
    const savedAt = session?.savedAt || 0
    if (!Array.isArray(session?.tabs) || session.tabs.length === 0) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }

    if (Date.now() - savedAt > SESSION_RESTORE_DURATION) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }

    return session
  } catch (error) {
    console.error('[WorkflowAutoSave] 读取标签会话失败:', error)
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch (e) {
      // 忽略
    }
    return null
  }
}

/**
 * 清理已保存的多标签会话
 */
export function clearWorkflowSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 清理标签会话失败:', error)
    return false
  }
}

/**
 * 保存工作流到历史记录
 * @param {Object} workflow - 工作流数据 { name, nodes, edges, viewport, tabId, workflowId }
 */
export function saveWorkflowToHistory(workflow) {
  if (!workflow || !workflow.nodes || workflow.nodes.length === 0) {
    return false
  }
  
  try {
    // 🔧 清理节点中的大数据（base64图片等）
    const cleanedNodes = cleanNodeData(workflow.nodes)
    const cleanedEdges = JSON.parse(JSON.stringify(workflow.edges || []))
    
    // 🔧 检查清理后的数据大小
    const testData = JSON.stringify({ nodes: cleanedNodes, edges: cleanedEdges })
    const dataSize = testData.length
    
    if (dataSize > MAX_SINGLE_WORKFLOW_SIZE) {
      console.warn(`[WorkflowAutoSave] 工作流数据过大 (${(dataSize / 1024).toFixed(1)}KB > ${MAX_SINGLE_WORKFLOW_SIZE / 1024}KB)，跳过历史保存`)
      console.warn(`[WorkflowAutoSave] 提示：请手动保存工作流到服务器，历史记录只用于临时恢复`)
      return false
    }
    
    let history = getWorkflowHistory()
    
    // 生成唯一ID
    const historyId = `history-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    
    // 创建历史记录（使用清理后的数据）
    const historyItem = {
      id: historyId,
      name: workflow.name || '未命名工作流',
      description: workflow.description || '',
      tabId: workflow.tabId || null,
      workflowId: workflow.workflowId || null,  // 原始工作流ID（如果是已保存的工作流）
      nodeCount: workflow.nodes.length,
      edgeCount: cleanedEdges.length,
      nodes: cleanedNodes,  // 使用清理后的节点
      edges: cleanedEdges,
      viewport: workflow.viewport ? { ...workflow.viewport } : { x: 0, y: 0, zoom: 1 },
      savedAt: Date.now(),
      dataSize: dataSize  // 记录数据大小，便于调试
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
        const newHash = generateSimpleHash(cleanedNodes)
        
        if (oldHash === newHash) {
          console.log('[WorkflowAutoSave] 内容无变化，跳过保存')
          return false
        }
      }
    }
    
    // 关键优化：如果是已保存的工作流（有workflowId），移除同一workflowId的旧记录
    if (workflow.workflowId) {
      history = history.filter(h => h.workflowId !== workflow.workflowId)
    } else if (workflow.tabId) {
      // 如果是未保存的工作流，移除同一tabId的旧记录（保留最新的）
      history = history.filter(h => h.tabId !== workflow.tabId)
    }
    
    // 添加到历史记录开头
    history.unshift(historyItem)
    
    // 限制历史记录数量
    while (history.length > MAX_HISTORY_COUNT) {
      history.pop()
    }
    
    // 🔧 安全保存到 localStorage
    if (saveToLocalStorage(history)) {
      console.log(`[WorkflowAutoSave] 已保存工作流: ${historyItem.name} | 节点数: ${historyItem.nodeCount} | 大小: ${(dataSize / 1024).toFixed(1)}KB`)
      return true
    }
    return false
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
    saveToLocalStorage(newHistory)
    console.log('[WorkflowAutoSave] 已删除历史记录:', historyId)
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 删除失败:', error)
    return false
  }
}

/**
 * 更新历史工作流描述
 * @param {String} historyId - 历史记录ID
 * @param {String} description - 描述内容
 */
export function updateWorkflowHistoryDescription(historyId, description) {
  try {
    const history = getWorkflowHistory()
    const target = history.find(h => h.id === historyId)
    if (!target) return false

    target.description = String(description ?? '')
    return saveToLocalStorage(history)
  } catch (error) {
    console.error('[WorkflowAutoSave] 更新历史描述失败:', error)
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
 * 格式化为北京时间，精确到分钟
 * @param {Number} timestamp - 时间戳
 */
export function formatBeijingSaveTime(timestamp) {
  if (!timestamp) return '-'

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(timestamp))

  const value = type => parts.find(part => part.type === type)?.value || ''
  return `${value('year')}/${value('month')}/${value('day')} ${value('hour')}:${value('minute')}`
}

/**
 * 获取历史记录数量
 */
export function getHistoryCount() {
  return getWorkflowHistory().length
}

/**
 * 🔧 获取当前存储使用情况（用于调试）
 */
export function getStorageStats() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    const size = data ? data.length : 0
    const history = data ? JSON.parse(data) : []
    
    return {
      count: history.length,
      totalSize: size,
      totalSizeKB: (size / 1024).toFixed(2),
      maxSize: MAX_TOTAL_STORAGE_SIZE,
      maxSizeKB: (MAX_TOTAL_STORAGE_SIZE / 1024).toFixed(0),
      usagePercent: ((size / MAX_TOTAL_STORAGE_SIZE) * 100).toFixed(1)
    }
  } catch (e) {
    return { error: e.message }
  }
}

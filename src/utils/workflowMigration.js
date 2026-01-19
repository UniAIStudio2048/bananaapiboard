/**
 * 工作流数据迁移工具
 * 
 * 用于处理旧版本工作流中的本地数据（blob URL、base64）
 * 将它们迁移到新的云存储方案
 */

import { uploadCanvasMedia } from '@/api/canvas/workflow'

/**
 * 检测 URL 类型
 */
export function detectUrlType(url) {
  if (!url || typeof url !== 'string') return 'empty'
  if (url.startsWith('blob:')) return 'blob'
  if (url.startsWith('data:image/')) return 'base64-image'
  if (url.startsWith('data:video/')) return 'base64-video'
  if (url.startsWith('data:audio/')) return 'base64-audio'
  if (url.startsWith('data:')) return 'base64-other'
  if (url.startsWith('http://') || url.startsWith('https://')) return 'http'
  if (url.startsWith('/api/')) return 'local-api'
  return 'unknown'
}

/**
 * 将 base64 数据转换为 File 对象
 */
function base64ToFile(base64String, filename = 'file') {
  try {
    const arr = base64String.split(',')
    const mimeMatch = arr[0].match(/:(.*?);/)
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    
    // 根据 MIME 类型确定文件扩展名
    const extMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg'
    }
    const ext = extMap[mime] || ''
    
    return new File([u8arr], `${filename}${ext}`, { type: mime })
  } catch (e) {
    console.error('[Migration] base64 转换失败:', e)
    return null
  }
}

/**
 * 获取媒体类型（用于上传）
 */
function getMediaType(url) {
  const type = detectUrlType(url)
  if (type === 'base64-image') return 'image'
  if (type === 'base64-video') return 'video'
  if (type === 'base64-audio') return 'audio'
  return 'image' // 默认按图片处理
}

/**
 * 分析工作流中需要迁移的数据
 * @param {Object} workflow - 工作流数据
 * @returns {Object} 分析结果
 */
export function analyzeWorkflow(workflow) {
  const result = {
    totalNodes: 0,
    needsMigration: false,
    blobUrls: [],      // 需要用户重新上传（无法恢复）
    base64Data: [],    // 可以自动迁移到云存储
    httpUrls: [],      // 正常的云存储URL
    localApiUrls: [],  // 本地API URL（可正常访问）
    issues: []
  }
  
  const nodes = workflow.nodes || []
  result.totalNodes = nodes.length
  
  for (const node of nodes) {
    const data = node.data || {}
    const nodeInfo = {
      id: node.id,
      type: node.type,
      title: data.title || data.label || node.id
    }
    
    // 检查 sourceImages
    if (data.sourceImages && Array.isArray(data.sourceImages)) {
      for (let i = 0; i < data.sourceImages.length; i++) {
        const url = data.sourceImages[i]
        const urlType = detectUrlType(url)
        
        if (urlType === 'blob') {
          result.blobUrls.push({
            ...nodeInfo,
            field: `sourceImages[${i}]`,
            url: url.substring(0, 50) + '...'
          })
        } else if (urlType.startsWith('base64')) {
          result.base64Data.push({
            ...nodeInfo,
            field: `sourceImages[${i}]`,
            dataSize: Math.round(url.length / 1024) + 'KB',
            mediaType: getMediaType(url)
          })
        } else if (urlType === 'http') {
          result.httpUrls.push({ ...nodeInfo, field: `sourceImages[${i}]` })
        } else if (urlType === 'local-api') {
          result.localApiUrls.push({ ...nodeInfo, field: `sourceImages[${i}]` })
        }
      }
    }
    
    // 检查 output.url
    if (data.output?.url) {
      const url = data.output.url
      const urlType = detectUrlType(url)
      
      if (urlType === 'blob') {
        result.blobUrls.push({
          ...nodeInfo,
          field: 'output.url',
          url: url.substring(0, 50) + '...'
        })
      } else if (urlType.startsWith('base64')) {
        result.base64Data.push({
          ...nodeInfo,
          field: 'output.url',
          dataSize: Math.round(url.length / 1024) + 'KB',
          mediaType: getMediaType(url)
        })
      }
    }
    
    // 检查 output.urls
    if (data.output?.urls && Array.isArray(data.output.urls)) {
      for (let i = 0; i < data.output.urls.length; i++) {
        const url = data.output.urls[i]
        const urlType = detectUrlType(url)
        
        if (urlType === 'blob') {
          result.blobUrls.push({
            ...nodeInfo,
            field: `output.urls[${i}]`,
            url: url.substring(0, 50) + '...'
          })
        } else if (urlType.startsWith('base64')) {
          result.base64Data.push({
            ...nodeInfo,
            field: `output.urls[${i}]`,
            dataSize: Math.round(url.length / 1024) + 'KB',
            mediaType: getMediaType(url)
          })
        }
      }
    }
    
    // 检查 audioUrl
    if (data.audioUrl) {
      const url = data.audioUrl
      const urlType = detectUrlType(url)
      
      if (urlType === 'blob') {
        result.blobUrls.push({
          ...nodeInfo,
          field: 'audioUrl',
          url: url.substring(0, 50) + '...'
        })
      } else if (urlType.startsWith('base64')) {
        result.base64Data.push({
          ...nodeInfo,
          field: 'audioUrl',
          dataSize: Math.round(url.length / 1024) + 'KB',
          mediaType: 'audio'
        })
      }
    }
  }
  
  result.needsMigration = result.blobUrls.length > 0 || result.base64Data.length > 0
  
  // 生成问题描述
  if (result.blobUrls.length > 0) {
    result.issues.push({
      type: 'error',
      message: `${result.blobUrls.length} 个本地临时文件已失效，需要重新上传`,
      details: result.blobUrls
    })
  }
  
  if (result.base64Data.length > 0) {
    const totalSize = result.base64Data.reduce((sum, item) => {
      return sum + parseInt(item.dataSize)
    }, 0)
    result.issues.push({
      type: 'warning',
      message: `${result.base64Data.length} 个文件使用旧格式存储 (${totalSize}KB)，将自动迁移到云存储`,
      details: result.base64Data
    })
  }
  
  return result
}

/**
 * 迁移工作流中的 base64 数据到云存储
 * @param {Object} workflow - 工作流数据（会被修改）
 * @param {Function} onProgress - 进度回调 (current, total, status)
 * @returns {Object} 迁移结果
 */
export async function migrateWorkflowData(workflow, onProgress) {
  const result = {
    success: true,
    migratedCount: 0,
    failedCount: 0,
    skippedBlobCount: 0,
    errors: [],
    nodes: workflow.nodes
  }
  
  const analysis = analyzeWorkflow(workflow)
  
  if (!analysis.needsMigration) {
    console.log('[Migration] 工作流不需要迁移')
    return result
  }
  
  const totalItems = analysis.base64Data.length
  let processedCount = 0
  
  // 记录 blob URL 数量（无法恢复）
  result.skippedBlobCount = analysis.blobUrls.length
  
  // 处理 base64 数据
  for (const item of analysis.base64Data) {
    processedCount++
    if (onProgress) {
      onProgress(processedCount, totalItems, `正在迁移: ${item.title}`)
    }
    
    try {
      // 找到对应的节点
      const node = workflow.nodes.find(n => n.id === item.id)
      if (!node) continue
      
      // 获取原始 base64 数据
      let base64Data = null
      let updatePath = item.field
      
      if (updatePath.startsWith('sourceImages[')) {
        const index = parseInt(updatePath.match(/\[(\d+)\]/)[1])
        base64Data = node.data.sourceImages[index]
      } else if (updatePath === 'output.url') {
        base64Data = node.data.output?.url
      } else if (updatePath.startsWith('output.urls[')) {
        const index = parseInt(updatePath.match(/\[(\d+)\]/)[1])
        base64Data = node.data.output?.urls?.[index]
      } else if (updatePath === 'audioUrl') {
        base64Data = node.data.audioUrl
      }
      
      if (!base64Data || !base64Data.startsWith('data:')) {
        continue
      }
      
      // 转换为 File 对象
      const file = base64ToFile(base64Data, `migrate_${node.id}_${Date.now()}`)
      if (!file) {
        result.errors.push({ nodeId: item.id, field: updatePath, error: '数据转换失败' })
        result.failedCount++
        continue
      }
      
      // 上传到云存储
      console.log(`[Migration] 上传 ${item.mediaType}: ${item.title} (${item.dataSize})`)
      const uploadResult = await uploadCanvasMedia(file, item.mediaType)
      const cloudUrl = uploadResult.url
      
      // 更新节点数据
      if (updatePath.startsWith('sourceImages[')) {
        const index = parseInt(updatePath.match(/\[(\d+)\]/)[1])
        node.data.sourceImages[index] = cloudUrl
      } else if (updatePath === 'output.url') {
        node.data.output.url = cloudUrl
      } else if (updatePath.startsWith('output.urls[')) {
        const index = parseInt(updatePath.match(/\[(\d+)\]/)[1])
        node.data.output.urls[index] = cloudUrl
      } else if (updatePath === 'audioUrl') {
        node.data.audioUrl = cloudUrl
        if (node.data.output?.url === base64Data) {
          node.data.output.url = cloudUrl
        }
      }
      
      result.migratedCount++
      console.log(`[Migration] ✅ 迁移成功: ${item.title} -> ${cloudUrl.substring(0, 60)}...`)
      
    } catch (error) {
      console.error(`[Migration] ❌ 迁移失败: ${item.title}`, error)
      result.errors.push({ nodeId: item.id, field: item.field, error: error.message })
      result.failedCount++
    }
  }
  
  // 处理 blob URL（标记为失效）
  for (const item of analysis.blobUrls) {
    const node = workflow.nodes.find(n => n.id === item.id)
    if (!node) continue
    
    // 将 blob URL 替换为空或占位符
    if (item.field.startsWith('sourceImages[')) {
      const index = parseInt(item.field.match(/\[(\d+)\]/)[1])
      // 移除失效的 blob URL
      node.data.sourceImages = node.data.sourceImages.filter((_, i) => i !== index)
    } else if (item.field === 'output.url') {
      node.data.output.url = null
      node.data._dataLost = true
      node.data._lostReason = '本地临时文件已失效，请重新生成或上传'
    } else if (item.field.startsWith('output.urls[')) {
      const index = parseInt(item.field.match(/\[(\d+)\]/)[1])
      if (node.data.output?.urls) {
        node.data.output.urls = node.data.output.urls.filter((_, i) => i !== index)
      }
    } else if (item.field === 'audioUrl') {
      node.data.audioUrl = null
      if (node.data.output) {
        node.data.output.url = null
      }
      node.data._dataLost = true
      node.data._lostReason = '本地临时文件已失效，请重新上传音频'
    }
  }
  
  result.success = result.failedCount === 0
  result.nodes = workflow.nodes
  
  return result
}

/**
 * 检查工作流是否需要迁移（快速检查）
 */
export function needsMigration(workflow) {
  const nodes = workflow?.nodes || []
  
  for (const node of nodes) {
    const data = node.data || {}
    
    // 检查常见的本地数据字段
    const urlsToCheck = [
      ...(data.sourceImages || []),
      data.output?.url,
      ...(data.output?.urls || []),
      data.audioUrl
    ].filter(Boolean)
    
    for (const url of urlsToCheck) {
      const type = detectUrlType(url)
      if (type === 'blob' || type.startsWith('base64')) {
        return true
      }
    }
  }
  
  return false
}


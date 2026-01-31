/**
 * 🚀 IndexedDB 图片缓存工具
 * 
 * 用于缓存历史记录图片，减少重复请求，提升加载速度
 * 
 * 特性：
 * - 持久化存储：关闭浏览器后缓存仍在
 * - LRU 淘汰策略：自动清理最久未访问的图片
 * - 容量限制：默认最多缓存 200MB
 * - 异步加载：不阻塞主线程
 */

const DB_NAME = 'BananaImageCache'
const DB_VERSION = 1
const STORE_NAME = 'images'
const MAX_CACHE_SIZE = 200 * 1024 * 1024 // 200MB
const MAX_ITEMS = 500 // 最多缓存 500 张图片

let dbInstance = null
let dbInitPromise = null

/**
 * 初始化 IndexedDB
 */
function initDB() {
  if (dbInitPromise) return dbInitPromise
  
  dbInitPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('[ImageCache] 浏览器不支持 IndexedDB')
      reject(new Error('IndexedDB not supported'))
      return
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      console.error('[ImageCache] 打开数据库失败:', request.error)
      reject(request.error)
    }
    
    request.onsuccess = () => {
      dbInstance = request.result
      console.log('[ImageCache] ✅ IndexedDB 初始化成功')
      resolve(dbInstance)
    }
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      
      // 创建图片存储
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' })
        // 创建索引用于 LRU 淘汰
        store.createIndex('lastAccess', 'lastAccess', { unique: false })
        store.createIndex('size', 'size', { unique: false })
        console.log('[ImageCache] 创建 IndexedDB 存储')
      }
    }
  })
  
  return dbInitPromise
}

/**
 * 获取数据库实例
 */
async function getDB() {
  if (dbInstance) return dbInstance
  return await initDB()
}

/**
 * 从缓存获取图片
 * @param {string} url - 图片 URL
 * @returns {Promise<Blob|null>} 图片 Blob 或 null
 */
export async function getCachedImage(url) {
  if (!url) return null
  
  try {
    const db = await getDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(url)
      
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          // 更新最后访问时间（LRU）
          result.lastAccess = Date.now()
          store.put(result)
          resolve(result.blob)
        } else {
          resolve(null)
        }
      }
      
      request.onerror = () => {
        console.warn('[ImageCache] 获取缓存失败:', request.error)
        resolve(null)
      }
    })
  } catch (e) {
    console.warn('[ImageCache] 获取缓存异常:', e)
    return null
  }
}

/**
 * 缓存图片
 * @param {string} url - 图片 URL
 * @param {Blob} blob - 图片 Blob
 */
export async function cacheImage(url, blob) {
  if (!url || !blob) return
  
  try {
    const db = await getDB()
    
    // 先检查是否需要清理
    await cleanupIfNeeded(db)
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const data = {
        url,
        blob,
        size: blob.size,
        type: blob.type,
        lastAccess: Date.now(),
        createdAt: Date.now()
      }
      
      const request = store.put(data)
      
      request.onsuccess = () => {
        // console.log(`[ImageCache] ✅ 缓存成功: ${url.substring(0, 50)}... (${formatSize(blob.size)})`)
        resolve()
      }
      
      request.onerror = () => {
        console.warn('[ImageCache] 缓存失败:', request.error)
        reject(request.error)
      }
    })
  } catch (e) {
    console.warn('[ImageCache] 缓存异常:', e)
  }
}

/**
 * 检查并清理缓存（LRU 策略）
 */
async function cleanupIfNeeded(db) {
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    
    // 获取所有缓存
    const request = store.getAll()
    
    request.onsuccess = () => {
      const items = request.result || []
      
      // 计算总大小
      let totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0)
      
      // 如果超出限制，删除最旧的
      if (totalSize > MAX_CACHE_SIZE || items.length > MAX_ITEMS) {
        console.log(`[ImageCache] 缓存清理: ${items.length} 项, ${formatSize(totalSize)}`)
        
        // 按最后访问时间排序（最旧的在前）
        items.sort((a, b) => (a.lastAccess || 0) - (b.lastAccess || 0))
        
        // 删除最旧的项目，直到满足条件
        let deleted = 0
        for (const item of items) {
          if (totalSize <= MAX_CACHE_SIZE * 0.8 && items.length - deleted <= MAX_ITEMS * 0.8) {
            break
          }
          
          store.delete(item.url)
          totalSize -= item.size || 0
          deleted++
        }
        
        console.log(`[ImageCache] 已清理 ${deleted} 项`)
      }
      
      resolve()
    }
    
    request.onerror = () => resolve()
  })
}

/**
 * 获取预览 URL（添加 preview 和 width 参数）
 * @param {string} url - 原始 URL
 * @param {number} width - 预览宽度
 * @returns {string} 带预览参数的 URL
 */
function getPreviewUrl(url, width = 800) {
  // 只对本地图片/视频接口启用预览模式
  if (url && (url.includes('/api/images/file/') || url.includes('/api/videos/file/'))) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}preview=true&w=${width}`
  }
  return url
}

/**
 * 从网络加载图片并缓存
 * @param {string} url - 图片 URL
 * @param {Object} options - 选项
 * @param {boolean} options.usePreview - 是否使用预览模式（启用 Redis 缓存）
 * @param {number} options.previewWidth - 预览图宽度（默认 800）
 * @returns {Promise<string>} Object URL（用于 img src）
 */
export async function loadImageWithCache(url, options = {}) {
  if (!url) return null
  
  const { usePreview = true, previewWidth = 800 } = options
  
  // 生成用于缓存的 key（预览模式使用带参数的 URL）
  const cacheUrl = usePreview ? getPreviewUrl(url, previewWidth) : url
  
  // 1. 先尝试从 IndexedDB 缓存获取
  const cachedBlob = await getCachedImage(cacheUrl)
  if (cachedBlob) {
    // console.log(`[ImageCache] 🎯 IndexedDB 命中: ${url.substring(0, 50)}...`)
    return URL.createObjectURL(cachedBlob)
  }
  
  // 2. 从网络加载（预览模式会使用服务端 Redis 缓存）
  try {
    const headers = options.headers || {}
    
    // 添加租户认证头
    const tenantId = localStorage.getItem('tenantId')
    const tenantKey = localStorage.getItem('tenantKey')
    if (tenantId) headers['X-Tenant-ID'] = tenantId
    if (tenantKey) headers['X-Tenant-Key'] = tenantKey
    
    // 使用预览 URL（会触发服务端 Redis 缓存）
    const fetchUrl = usePreview ? getPreviewUrl(url, previewWidth) : url
    const response = await fetch(fetchUrl, { headers })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    // 检查是否命中服务端缓存
    const cacheHit = response.headers.get('X-Cache')
    if (cacheHit === 'HIT') {
      // console.log(`[ImageCache] 🚀 Redis 命中: ${url.substring(0, 50)}...`)
    }
    
    const blob = await response.blob()
    
    // 3. 缓存图片到 IndexedDB（异步，不等待）
    cacheImage(cacheUrl, blob).catch(() => {})
    
    // 4. 返回 Object URL
    return URL.createObjectURL(blob)
  } catch (e) {
    console.warn(`[ImageCache] 加载失败: ${url}`, e.message)
    return null
  }
}

/**
 * 预加载图片列表
 * @param {Array<string>} urls - 图片 URL 列表
 * @param {number} concurrency - 并发数
 */
export async function preloadImages(urls, concurrency = 3) {
  if (!urls || urls.length === 0) return
  
  const queue = [...urls]
  const loading = new Set()
  
  const loadNext = async () => {
    if (queue.length === 0) return
    
    const url = queue.shift()
    if (!url || loading.has(url)) return
    
    loading.add(url)
    
    try {
      // 检查是否已缓存
      const cached = await getCachedImage(url)
      if (!cached) {
        // 未缓存，加载并缓存
        await loadImageWithCache(url)
      }
    } catch (e) {
      // 忽略错误
    } finally {
      loading.delete(url)
    }
    
    // 继续加载下一个
    await loadNext()
  }
  
  // 并发加载
  const workers = []
  for (let i = 0; i < concurrency; i++) {
    workers.push(loadNext())
  }
  
  await Promise.all(workers)
}

/**
 * 获取缓存统计信息
 */
export async function getCacheStats() {
  try {
    const db = await getDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()
      
      request.onsuccess = () => {
        const items = request.result || []
        const totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0)
        
        resolve({
          count: items.length,
          totalSize,
          totalSizeFormatted: formatSize(totalSize),
          maxSize: MAX_CACHE_SIZE,
          maxSizeFormatted: formatSize(MAX_CACHE_SIZE),
          usage: (totalSize / MAX_CACHE_SIZE * 100).toFixed(1) + '%'
        })
      }
      
      request.onerror = () => {
        resolve({ count: 0, totalSize: 0, error: request.error })
      }
    })
  } catch (e) {
    return { count: 0, totalSize: 0, error: e.message }
  }
}

/**
 * 清空所有缓存
 */
export async function clearCache() {
  try {
    const db = await getDB()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()
      
      request.onsuccess = () => {
        console.log('[ImageCache] ✅ 缓存已清空')
        resolve()
      }
      
      request.onerror = () => {
        reject(request.error)
      }
    })
  } catch (e) {
    console.error('[ImageCache] 清空缓存失败:', e)
    throw e
  }
}

/**
 * 删除指定图片的缓存
 */
export async function removeCachedImage(url) {
  if (!url) return
  
  try {
    const db = await getDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(url)
      
      request.onsuccess = () => resolve(true)
      request.onerror = () => resolve(false)
    })
  } catch (e) {
    return false
  }
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 页面加载时初始化
if (typeof window !== 'undefined') {
  initDB().catch(() => {})
}

export default {
  getCachedImage,
  cacheImage,
  loadImageWithCache,
  preloadImages,
  getCacheStats,
  clearCache,
  removeCachedImage
}


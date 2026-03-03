/**
 * Model Stats Store - 模型成功率統計集中管理
 * 
 * 功能：
 * - 集中管理 image/video 模型的當日成功率數據
 * - 10 分鐘自動輪詢刷新
 * - 跨日（0 點）自動重置並重新拉取
 * - 所有 ImageNode/VideoNode 共享同一份數據，避免冗餘請求
 * 
 * 使用方式：
 *   import { useModelStatsStore } from '@/stores/canvas/modelStatsStore'
 *   const modelStats = useModelStatsStore()
 *   modelStats.ensureStarted()  // 確保輪詢已啟動
 *   const rate = modelStats.getImageModelRate('nano-banana-2')
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

const POLL_INTERVAL_MS = 10 * 60 * 1000 // 10 分鐘

export const useModelStatsStore = defineStore('modelStats', () => {
  // ========== 狀態 ==========
  const imageStats = ref({})   // { modelName: { total, success, failed, rate } }
  const videoStats = ref({})   // { modelName: { total, success, failed, rate } }
  const loading = ref(false)
  const lastFetchTime = ref(0) // 上次拉取的時間戳
  const currentDate = ref('')  // 當前統計日期 'YYYY-MM-DD'
  
  // 輪詢控制
  let pollTimer = null
  let started = false
  
  // ========== Getters ==========
  
  // 獲取圖像模型成功率（供 ImageNode 使用）
  function getImageModelRate(modelName) {
    return _resolveRate(modelName, imageStats.value)
  }
  
  // 獲取視頻模型成功率（供 VideoNode 使用）
  function getVideoModelRate(modelName) {
    return _resolveRate(modelName, videoStats.value)
  }
  
  // 獲取圖像模型統計對象（供 VEO 前端聚合回退使用）
  function getImageModelStat(modelName) {
    return imageStats.value[modelName] || null
  }
  
  // 獲取視頻模型統計對象（供 VEO 前端聚合回退使用）
  function getVideoModelStat(modelName) {
    return videoStats.value[modelName] || null
  }
  
  // 獲取原始 imageStats（供組件直接遍歷使用）
  const rawImageStats = computed(() => imageStats.value)
  const rawVideoStats = computed(() => videoStats.value)
  
  // ========== 內部匹配邏輯 ==========
  
  function _resolveRate(modelName, stats) {
    if (!modelName || !stats) return null
    
    // 1. 精確匹配（後端已按配置模型名聚合，通常能直接匹配）
    if (stats[modelName]?.rate !== undefined) {
      return stats[modelName].rate
    }
    
    // 2. 格式歸一化匹配（處理 model-name vs modelname、veo3.1 vs veo31 等差異）
    const normalize = (name) => name.toLowerCase().replace(/[-_\s.]/g, '')
    const normalizedName = normalize(modelName)
    
    for (const [key, stat] of Object.entries(stats)) {
      if (normalize(key) === normalizedName && stat.rate !== undefined) {
        return stat.rate
      }
    }
    
    // 匹配不到時返回 null（前端顯示灰色 '--'），不使用包含匹配避免相似模型名交叉污染
    return null
  }
  
  // ========== 數據拉取 ==========
  
  async function fetchStats() {
    if (loading.value) return
    loading.value = true
    
    try {
      const token = localStorage.getItem('token')
      const headers = {
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
      
      // 同時拉取 image 和 video 統計（一次請求返回兩種數據）
      const response = await fetch(`${getApiUrl('/api/model-stats/success-rate')}`, { headers })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          if (data.stats?.image) {
            imageStats.value = data.stats.image
          }
          if (data.stats?.video) {
            videoStats.value = data.stats.video
          }
          // 記錄統計日期（用於跨日檢測）
          if (data.date) {
            currentDate.value = data.date
          }
          lastFetchTime.value = Date.now()
          console.log(`[modelStatsStore] ✅ 統計數據已更新 | 日期: ${data.date} | 圖像模型: ${Object.keys(imageStats.value).length} | 視頻模型: ${Object.keys(videoStats.value).length}`)
        }
      }
    } catch (e) {
      console.warn('[modelStatsStore] 獲取模型成功率失敗:', e)
    } finally {
      loading.value = false
    }
  }
  
  // ========== 跨日檢測 ==========
  
  function _checkDateChange() {
    const today = new Date().toISOString().split('T')[0]
    if (currentDate.value && currentDate.value !== today) {
      console.log(`[modelStatsStore] 🔄 跨日檢測：${currentDate.value} → ${today}，重置統計數據`)
      imageStats.value = {}
      videoStats.value = {}
      currentDate.value = today
      // 立即重新拉取
      fetchStats()
    }
  }
  
  // ========== 輪詢管理 ==========
  
  /**
   * 確保輪詢已啟動（冪等，多次調用不會重複啟動）
   * 每個使用成功率的組件在 setup 時調用一次即可
   */
  function ensureStarted() {
    if (started) return
    started = true
    
    // 立即拉取一次
    fetchStats()
    
    // 啟動定時輪詢（10 分鐘）
    pollTimer = setInterval(() => {
      _checkDateChange()
      fetchStats()
    }, POLL_INTERVAL_MS)
    
    console.log(`[modelStatsStore] 🚀 輪詢已啟動，間隔: ${POLL_INTERVAL_MS / 1000 / 60} 分鐘`)
  }
  
  /**
   * 停止輪詢（通常在 app 卸載時調用）
   */
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    started = false
    console.log('[modelStatsStore] ⏹ 輪詢已停止')
  }
  
  /**
   * 手動刷新（用於用戶主動觸發）
   */
  async function refresh() {
    await fetchStats()
  }
  
  return {
    // 狀態
    imageStats,
    videoStats,
    loading,
    lastFetchTime,
    currentDate,
    rawImageStats,
    rawVideoStats,
    
    // 查詢方法
    getImageModelRate,
    getVideoModelRate,
    getImageModelStat,
    getVideoModelStat,
    
    // 控制方法
    ensureStarted,
    stopPolling,
    refresh,
    fetchStats
  }
})

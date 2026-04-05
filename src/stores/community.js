/**
 * 社区模块 Store
 * 管理社区页面的公共状态：轮播图、分类、标签、登录弹窗
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBanners, getCategories, getTags, getSectionNames } from '@/api/community'

export const useCommunityStore = defineStore('community', () => {
  // ==================== 状态 ====================
  const banners = ref([])
  const categories = ref([])
  const tags = ref([])
  const showLoginModal = ref(false)
  const sectionNames = ref({
    features: '特色功能',
    templates: '模板库',
    templates_subtitle: '为你推荐',
    tvshow: 'TV Show'
  })

  // ==================== 方法 ====================

  /** 加载轮播图 */
  async function loadBanners() {
    try {
      const data = await getBanners()
      banners.value = data.banners || data.data || []
    } catch (error) {
      console.error('[CommunityStore] 加载轮播图失败:', error)
      banners.value = []
    }
  }

  /** 加载分类列表 */
  async function loadCategories() {
    try {
      const data = await getCategories()
      categories.value = data.categories || data.data || []
    } catch (error) {
      console.error('[CommunityStore] 加载分类失败:', error)
      categories.value = []
    }
  }

  /** 加载标签列表 */
  async function loadTags() {
    try {
      const data = await getTags()
      tags.value = data.tags || data.data || []
    } catch (error) {
      console.error('[CommunityStore] 加载标签失败:', error)
      tags.value = []
    }
  }

  /** 加载区块自定义名称 */
  async function loadSectionNames() {
    try {
      const data = await getSectionNames()
      const names = data.data || data
      sectionNames.value = {
        features: names.features || '特色功能',
        templates: names.templates || '模板库',
        templates_subtitle: names.templates_subtitle || '为你推荐',
        tvshow: names.tvshow || 'TV Show'
      }
    } catch (error) {
      console.error('[CommunityStore] 加载区块名称失败:', error)
    }
  }

  /**
   * 检查登录状态，未登录则弹出登录弹窗
   * @returns {boolean} 是否已登录
   */
  function requireLogin() {
    const token = localStorage.getItem('token')
    if (!token) {
      showLoginModal.value = true
      return false
    }
    return true
  }

  return {
    banners,
    categories,
    tags,
    showLoginModal,
    sectionNames,
    loadBanners,
    loadCategories,
    loadTags,
    loadSectionNames,
    requireLogin
  }
})

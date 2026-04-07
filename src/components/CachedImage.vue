<template>
  <div ref="wrapperRef" class="cached-image-wrapper" :class="wrapperClass" :style="wrapperStyle">
    <!-- 模糊占位层（渐进式加载第一阶段） -->
    <div 
      v-if="progressive && isLoading && blurSrc"
      class="cached-image-blur"
      :style="{ backgroundImage: `url(${blurSrc})` }"
    />
    <!-- 实际图片：lazy 模式下，等有 displaySrc 后才渲染 img，避免 src="" 触发错误 -->
  <img 
    v-if="displaySrc"
    ref="imgRef"
    :src="displaySrc"
    :alt="alt"
      :class="[imgClass, { 'cached-image-loaded': !isLoading }]"
    :style="imgStyle"
    :loading="loading"
    @load="handleLoad"
    @error="handleError"
  />
  </div>
</template>

<script setup>
/**
 * 🚀 带 IndexedDB 缓存 + 渐进式加载的图片组件
 * 
 * 特性：
 * - 自动缓存加载过的图片到 IndexedDB
 * - 再次访问时从缓存读取，毫秒级加载
 * - 渐进式加载：模糊缩略图 → 清晰缩略图 → 原图
 * - 支持懒加载、错误处理、占位图
 * 
 * 使用：
 * <CachedImage 
 *   :src="imageUrl" 
 *   :thumbnail-src="thumbnailUrl"
 *   alt="图片描述"
 *   progressive
 *   class="w-full h-full object-cover"
 * />
 */

import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { loadImageWithCache } from '@/utils/imageCache'

const props = defineProps({
  src: { type: String, default: '' },
  thumbnailSrc: { type: String, default: '' },
  alt: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  cache: { type: Boolean, default: true },
  progressive: { type: Boolean, default: false },
  loading: { type: String, default: 'lazy' },
  imgClass: { type: [String, Object, Array], default: '' },
  imgStyle: { type: [String, Object], default: '' },
  wrapperClass: { type: [String, Object, Array], default: '' },
  wrapperStyle: { type: [String, Object], default: '' }
})

const emit = defineEmits(['load', 'error', 'cached'])

const wrapperRef = ref(null)
const imgRef = ref(null)
const displaySrc = ref('')
const isLoading = ref(true)
const hasError = ref(false)
let objectUrl = null
let usedCache = false
let originalUrl = ''
let isUpgrading = false

// IntersectionObserver 懒加载
const isVisible = ref(false)
const hasBeenVisible = ref(false)
let observer = null

onMounted(() => {
  // eager 模式跳过 IntersectionObserver，直接标记可见
  if (props.loading === 'eager') {
    isVisible.value = true
    hasBeenVisible.value = true
    return
  }
  
  nextTick(() => {
    const target = wrapperRef.value || imgRef.value
    if (target && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          isVisible.value = true
          hasBeenVisible.value = true
          observer?.disconnect()
          observer = null
        }
      }, {
        rootMargin: '200px'
      })
      observer.observe(target)
    } else {
      isVisible.value = true
      hasBeenVisible.value = true
    }
  })
})

const blurSrc = computed(() => {
  if (props.thumbnailSrc) return props.thumbnailSrc
  if (props.placeholder) return props.placeholder
  return ''
})

function shouldCache(url) {
  if (!url || !props.cache) return false
  if (url.startsWith('blob:') || url.startsWith('data:')) return false
  
  // COS 代理：默认缓存，但排除包含 ci-process= 的实时处理 URL（如视频截帧）
  if (url.includes('/api/cos-proxy/') && url.includes('ci-process=')) return false
  
  if (url.includes('/api/images/file/')) return true
  if (url.includes('/api/videos/file/')) return true
  if (url.startsWith('/api/') || url.startsWith('/storage/')) return true
  if (url.includes('imageView2') || url.includes('imageMogr2')) return true
  if (url.includes('files.nananobanana.cn') || 
      url.includes('qiniucdn') || url.includes('clouddn') || 
      url.includes('qnssl') || url.includes('qbox.me') ||
      url.includes('myqcloud.com')) return false
  return false
}

async function loadImage(url) {
  if (!url) {
    displaySrc.value = props.placeholder
    return
  }
  
  // lazy 模式下等待元素进入视口再加载
  if (props.loading === 'lazy' && !hasBeenVisible.value) {
    return
  }
  
  isLoading.value = true
  hasError.value = false
  usedCache = false
  isUpgrading = false
  originalUrl = url
  
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  
  const thumbUrl = props.thumbnailSrc
  if (props.progressive && thumbUrl && thumbUrl !== url) {
    if (shouldCache(thumbUrl)) {
      try {
        const cachedThumb = await loadImageWithCache(thumbUrl)
        if (cachedThumb) {
          objectUrl = cachedThumb
          displaySrc.value = cachedThumb
          usedCache = true
          isLoading.value = false
          upgradeToFullImage(url)
          return
        }
      } catch (e) { /* fallthrough */ }
    }
    displaySrc.value = thumbUrl
    isLoading.value = false
    upgradeToFullImage(url)
    return
  }

  if (props.placeholder) {
    displaySrc.value = props.placeholder
  }

  if (shouldCache(url)) {
    try {
      const cachedUrl = await loadImageWithCache(url)
      if (cachedUrl) {
        objectUrl = cachedUrl
        displaySrc.value = cachedUrl
        usedCache = true
        isLoading.value = false
        emit('cached', true)
        return
      }
    } catch (e) {
      console.warn('[CachedImage] 缓存加载失败，使用原始 URL:', e)
    }
  }
  
  displaySrc.value = url
  isLoading.value = false
}

// 渐进式加载第二阶段：后台加载原图并替换
async function upgradeToFullImage(url) {
  isUpgrading = true
  try {
    if (shouldCache(url)) {
      const cachedUrl = await loadImageWithCache(url)
      if (cachedUrl && isUpgrading) {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = cachedUrl
        displaySrc.value = cachedUrl
        usedCache = true
        emit('cached', true)
        return
      }
    }
    // 缓存失败或不需要缓存，直接用原始URL
    if (isUpgrading) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }
      usedCache = false
      displaySrc.value = url
    }
  } catch (e) {
    // 升级失败不影响已显示的缩略图
    console.warn('[CachedImage] 原图加载失败，保持缩略图:', e.message)
  } finally {
    isUpgrading = false
  }
}

function handleLoad() {
  isLoading.value = false
  hasError.value = false
  emit('load')
}

function handleError(e) {
  isLoading.value = false
  
  if (usedCache && originalUrl) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
    usedCache = false
    displaySrc.value = originalUrl
    return
  }
  
  hasError.value = true
  if (props.placeholder && displaySrc.value !== props.placeholder) {
    displaySrc.value = props.placeholder
  }
  emit('error', e)
}

// 监听 src 变化和 IntersectionObserver 可见性
watch(() => props.src, (newSrc) => {
  loadImage(newSrc)
}, { immediate: true })

watch(hasBeenVisible, (visible) => {
  if (visible && props.src) {
    loadImage(props.src)
  }
})

onUnmounted(() => {
  isUpgrading = false
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
})
</script>

<style scoped>
.cached-image-wrapper {
  position: relative;
  overflow: hidden;
}
.cached-image-blur {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: blur(20px);
  transform: scale(1.1);
  z-index: 1;
  transition: opacity 0.3s ease;
}
.cached-image-wrapper > img {
  position: relative;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.cached-image-wrapper > img.cached-image-loaded {
  opacity: 1;
}
/* 当不使用渐进式加载时，图片直接显示 */
.cached-image-wrapper:not(:has(.cached-image-blur)) > img {
  opacity: 1;
  transition: none;
}
</style>
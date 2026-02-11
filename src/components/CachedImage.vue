<template>
  <img 
    ref="imgRef"
    :src="displaySrc"
    :alt="alt"
    :class="imgClass"
    :style="imgStyle"
    :loading="loading"
    @load="handleLoad"
    @error="handleError"
  />
</template>

<script setup>
/**
 * 🚀 带 IndexedDB 缓存的图片组件
 * 
 * 特性：
 * - 自动缓存加载过的图片到 IndexedDB
 * - 再次访问时从缓存读取，毫秒级加载
 * - 支持懒加载、错误处理、占位图
 * 
 * 使用：
 * <CachedImage 
 *   :src="imageUrl" 
 *   alt="图片描述"
 *   :placeholder="placeholderUrl"
 *   class="w-full h-full object-cover"
 * />
 */

import { ref, watch, onMounted, onUnmounted } from 'vue'
import { loadImageWithCache, getCachedImage } from '@/utils/imageCache'

const props = defineProps({
  // 图片 URL
  src: {
    type: String,
    default: ''
  },
  // 替代文本
  alt: {
    type: String,
    default: ''
  },
  // 占位图（加载中/加载失败时显示）
  placeholder: {
    type: String,
    default: ''
  },
  // 是否启用缓存
  cache: {
    type: Boolean,
    default: true
  },
  // 懒加载
  loading: {
    type: String,
    default: 'lazy'
  },
  // 自定义 class
  imgClass: {
    type: [String, Object, Array],
    default: ''
  },
  // 自定义 style
  imgStyle: {
    type: [String, Object],
    default: ''
  }
})

const emit = defineEmits(['load', 'error', 'cached'])

const imgRef = ref(null)
const displaySrc = ref('')
const isLoading = ref(true)
const hasError = ref(false)
let objectUrl = null // 用于释放内存
let usedCache = false // 标记当前是否使用了缓存加载的 blob URL
let originalUrl = '' // 保存原始 URL，用于 blob 失败时回退

// 判断是否是需要缓存的 URL
function shouldCache(url) {
  if (!url || !props.cache) return false
  
  // blob: / data: URL 不缓存
  if (url.startsWith('blob:') || url.startsWith('data:')) return false
  
  // COS 代理 URL 不走 fetch 缓存（服务端已设置 Cache-Control: immutable，
  // 浏览器原生 HTTP 缓存足够，且大图走 fetch→blob 容易导致并发加载失败）
  if (url.includes('/api/cos-proxy/')) return false
  
  // 本地存储 URL 需要缓存
  if (url.includes('/api/images/file/')) return true
  if (url.includes('/api/videos/file/')) return true
  
  // 相对路径需要缓存
  if (url.startsWith('/api/') || url.startsWith('/storage/')) return true
  
  // CDN 缩略图也缓存到 IndexedDB（带 imageView2 参数的是小图，适合缓存）
  if (url.includes('imageView2') || url.includes('imageMogr2')) return true
  
  // 七牛云/腾讯云 CDN 原图不缓存（CDN 本身有缓存，原图太大）
  if (url.includes('files.nananobanana.cn') || 
      url.includes('qiniucdn') || url.includes('clouddn') || 
      url.includes('qnssl') || url.includes('qbox.me') ||
      url.includes('myqcloud.com')) return false
  
  return false
}

// 加载图片
async function loadImage(url) {
  if (!url) {
    displaySrc.value = props.placeholder
    return
  }
  
  isLoading.value = true
  hasError.value = false
  usedCache = false
  originalUrl = url
  
  // 先显示占位图
  if (props.placeholder) {
    displaySrc.value = props.placeholder
  }
  
  // 释放之前的 Object URL
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  
  // 判断是否需要使用缓存
  if (shouldCache(url)) {
    try {
      // 使用缓存加载
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
  
  // 不使用缓存或缓存失败，直接使用原始 URL
  displaySrc.value = url
  isLoading.value = false
}

// 图片加载成功
function handleLoad() {
  isLoading.value = false
  hasError.value = false
  emit('load')
}

// 图片加载失败
function handleError(e) {
  isLoading.value = false
  
  // 如果是缓存的 blob URL 加载失败，回退到原始 URL 直接显示（绕过缓存）
  if (usedCache && originalUrl) {
    console.warn('[CachedImage] blob URL 加载失败，回退到原始 URL:', originalUrl.substring(0, 60))
    // 释放失败的 blob URL
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
    usedCache = false
    displaySrc.value = originalUrl
    return // 不触发 error 事件，给原始 URL 一次机会
  }
  
  hasError.value = true
  
  // 显示占位图
  if (props.placeholder && displaySrc.value !== props.placeholder) {
    displaySrc.value = props.placeholder
  }
  
  emit('error', e)
}

// 监听 src 变化
watch(() => props.src, (newSrc) => {
  loadImage(newSrc)
}, { immediate: true })

// 组件卸载时释放 Object URL
onUnmounted(() => {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
})
</script>


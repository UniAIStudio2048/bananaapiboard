<template>
  <div class="wheel-selector vertical" @wheel.prevent="handleWheel">
    <!-- 上箭头 -->
    <button class="wheel-arrow up" @click="prev" :disabled="currentIndex <= 0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
    </button>
    
    <!-- 中间显示区域 -->
    <div class="wheel-display vertical">
      <!-- 上一项（模糊） -->
      <div class="wheel-item prev" v-if="prevItem">
        <img v-if="getIcon(prevItem)" :src="getIcon(prevItem)" class="item-icon" @error="handleImageError" />
        <span v-else class="item-text-small">{{ getLabel(prevItem) }}</span>
      </div>
      
      <!-- 当前项 -->
      <div class="wheel-item current">
        <img v-if="getIcon(currentItem)" :src="getIcon(currentItem)" class="item-icon current-icon" @error="handleImageError" />
        <span v-else class="item-text">{{ getLabel(currentItem) }}</span>
      </div>
      
      <!-- 下一项（模糊） -->
      <div class="wheel-item next" v-if="nextItem">
        <img v-if="getIcon(nextItem)" :src="getIcon(nextItem)" class="item-icon" @error="handleImageError" />
        <span v-else class="item-text-small">{{ getLabel(nextItem) }}</span>
      </div>
    </div>
    
    <!-- 下箭头 -->
    <button class="wheel-arrow down" @click="next" :disabled="currentIndex >= items.length - 1">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, required: true, default: () => [] },
  modelValue: { required: true },
  labelKey: { type: String, default: null },
  iconKey: { type: String, default: null },
  valueKey: { type: String, default: 'id' },
  formatLabel: { type: Function, default: null }
})

const emit = defineEmits(['update:modelValue'])

// 计算当前选中项的索引
const currentIndex = computed(() => {
  if (!props.items || props.items.length === 0) return -1
  
  // 如果是对象数组，通过 valueKey 查找
  if (props.valueKey && typeof props.items[0] === 'object') {
    return props.items.findIndex(item => item[props.valueKey] === props.modelValue)
  }
  // 如果是简单数组，直接查找值
  return props.items.indexOf(props.modelValue)
})

// 当前项
const currentItem = computed(() => props.items[currentIndex.value])
// 上一项
const prevItem = computed(() => props.items[currentIndex.value - 1])
// 下一项
const nextItem = computed(() => props.items[currentIndex.value + 1])

// 获取显示标签
function getLabel(item) {
  if (!item) return ''
  if (props.formatLabel) {
    const value = typeof item === 'object' ? item[props.valueKey] : item
    return props.formatLabel(value)
  }
  if (props.labelKey && typeof item === 'object') {
    return item[props.labelKey]
  }
  return item
}

// 获取图标
function getIcon(item) {
  if (!item || !props.iconKey) return null
  if (typeof item === 'object') {
    return item[props.iconKey]
  }
  return null
}

// 图片加载失败处理
function handleImageError(e) {
  e.target.style.display = 'none'
}

// 上一个
function prev() {
  if (currentIndex.value > 0) {
    const newItem = props.items[currentIndex.value - 1]
    const value = typeof newItem === 'object' ? newItem[props.valueKey] : newItem
    emit('update:modelValue', value)
  }
}

// 下一个
function next() {
  if (currentIndex.value < props.items.length - 1) {
    const newItem = props.items[currentIndex.value + 1]
    const value = typeof newItem === 'object' ? newItem[props.valueKey] : newItem
    emit('update:modelValue', value)
  }
}

// 滚轮处理
function handleWheel(e) {
  if (e.deltaY > 0) {
    next()
  } else {
    prev()
  }
}
</script>

<style scoped>
/* 垂直滚轮选择器 */
.wheel-selector.vertical {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 8px 6px;
  min-width: 90px;
  user-select: none;
}

.wheel-arrow {
  width: 100%;
  height: 24px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.15s ease;
  padding: 0;
}

.wheel-arrow:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.wheel-arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.wheel-arrow svg {
  width: 14px;
  height: 14px;
}

.wheel-display.vertical {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 70px;
  justify-content: center;
  overflow: hidden;
  padding: 4px 0;
}

.wheel-item {
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.wheel-item.prev,
.wheel-item.next {
  opacity: 0.25;
  transform: scale(0.75);
  filter: blur(1px);
  height: 18px;
}

.wheel-item.current {
  opacity: 1;
  transform: scale(1);
  min-height: 36px;
}

.item-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 4px;
}

.item-icon.current-icon {
  width: 40px;
  height: 40px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.item-text {
  font-size: 14px;
  font-weight: 600;
  color: white;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  padding: 0 4px;
}

.item-text-small {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* ========== 亮色主题适配 ========== */
:root.canvas-theme-light .wheel-selector.vertical {
  background: rgba(0, 0, 0, 0.03);
}

:root.canvas-theme-light .wheel-arrow {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .wheel-arrow:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .item-text {
  color: #333;
}

:root.canvas-theme-light .item-text-small {
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .item-icon.current-icon {
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
}
</style>


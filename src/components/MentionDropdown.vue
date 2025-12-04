<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  markers: {
    type: Array,
    default: () => []
  },
  visible: {
    type: Boolean,
    default: false
  },
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  }
})

const emit = defineEmits(['select', 'close'])

const selectedIndex = ref(0)

// 可选项列表
const options = computed(() => {
  return props.markers.map(marker => ({
    label: marker.label,
    text: marker.displayLabel ? `${marker.displayLabel}位置` : `${marker.label}位置`,
    value: marker.label,
    displayLabel: marker.displayLabel,
    imageIndex: marker.imageIndex
  }))
})

// 键盘导航
function handleKeydown(e) {
  if (!props.visible) return
  
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, options.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (options.value[selectedIndex.value]) {
      selectOption(options.value[selectedIndex.value])
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

// 选择选项
function selectOption(option) {
  emit('select', option)
  selectedIndex.value = 0
}

// 重置选中索引
watch(() => props.visible, (visible) => {
  if (visible) {
    selectedIndex.value = 0
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && options.length > 0"
      class="mention-dropdown"
      :style="{
        left: `${position.x}px`,
        top: `${position.y}px`
      }"
    >
      <div class="mention-dropdown-list">
        <div
          v-for="(option, index) in options"
          :key="`${option.imageIndex}-${option.value}`"
          class="mention-dropdown-item"
          :class="{ active: index === selectedIndex }"
          @click="selectOption(option)"
          @mouseenter="selectedIndex = index"
        >
          <span class="mention-icon">📍</span>
          <span class="mention-label">{{ option.label }}</span>
          <span class="mention-text">{{ option.text }}</span>
          <span v-if="option.imageIndex !== undefined" class="mention-image-badge">
            图{{ option.imageIndex + 1 }}
          </span>
        </div>
      </div>
      <div class="mention-dropdown-hint">
        <span class="text-xs text-slate-500 dark:text-slate-400">
          ↑↓ 选择 · Enter 确认 · Esc 取消
        </span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mention-dropdown {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  max-width: 300px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: slideUp 0.2s ease-out;
}

.dark .mention-dropdown {
  background: #1e293b;
  border-color: #334155;
}

.mention-dropdown-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
}

.mention-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.mention-dropdown-item:hover,
.mention-dropdown-item.active {
  background: #f1f5f9;
}

.dark .mention-dropdown-item:hover,
.dark .mention-dropdown-item.active {
  background: #334155;
}

.mention-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.mention-label {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  border-radius: 6px;
  font-weight: bold;
  font-size: 12px;
  flex-shrink: 0;
}

.mention-text {
  color: #334155;
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}

.dark .mention-text {
  color: #e2e8f0;
}

.mention-image-badge {
  padding: 2px 8px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.dark .mention-image-badge {
  background: #334155;
  color: #94a3b8;
}

.mention-dropdown-hint {
  padding: 8px 12px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.dark .mention-dropdown-hint {
  border-top-color: #334155;
  background: #0f172a;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 滚动条样式 */
.mention-dropdown-list::-webkit-scrollbar {
  width: 6px;
}

.mention-dropdown-list::-webkit-scrollbar-track {
  background: transparent;
}

.mention-dropdown-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.dark .mention-dropdown-list::-webkit-scrollbar-thumb {
  background: #475569;
}
</style>


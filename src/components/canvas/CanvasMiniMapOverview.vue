<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  viewportBounds: { type: Object, default: null },
  width: { type: Number, default: 220 },
  height: { type: Number, default: 150 }
})

const emit = defineEmits(['click'])

const contentBounds = computed(() => {
  const items = props.items.filter(item => item && Number.isFinite(item.left) && Number.isFinite(item.top))
  if (items.length === 0) return { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const item of items) {
    left = Math.min(left, item.left)
    top = Math.min(top, item.top)
    right = Math.max(right, item.right)
    bottom = Math.max(bottom, item.bottom)
  }
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const padding = Math.max(width, height) * 0.04
  return {
    left: left - padding,
    top: top - padding,
    right: right + padding,
    bottom: bottom + padding,
    width: width + padding * 2,
    height: height + padding * 2
  }
})

const viewBox = computed(() => {
  const bounds = contentBounds.value
  return `${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`
})

const viewportRect = computed(() => {
  const viewport = props.viewportBounds
  if (!viewport) return null
  return {
    x: viewport.left,
    y: viewport.top,
    width: Math.max(1, viewport.width),
    height: Math.max(1, viewport.height)
  }
})

function nodeClass(item) {
  const type = String(item?.type || '')
  if (type.includes('video')) return 'overview-node is-video'
  if (type.includes('audio')) return 'overview-node is-audio'
  if (type.includes('text') || type.includes('llm')) return 'overview-node is-text'
  if (type === 'group') return 'overview-node is-group'
  return 'overview-node'
}

function handleClick(event) {
  const svg = event.currentTarget
  const rect = svg.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const bounds = contentBounds.value
  const x = bounds.left + ((event.clientX - rect.left) / rect.width) * bounds.width
  const y = bounds.top + ((event.clientY - rect.top) / rect.height) * bounds.height
  emit('click', { position: { x, y } })
}
</script>

<template>
  <div class="canvas-minimap-overview" aria-label="画布地图">
    <svg
      :width="width"
      :height="height"
      :viewBox="viewBox"
      role="img"
      @click="handleClick"
    >
      <rect
        class="overview-bg"
        :x="contentBounds.left"
        :y="contentBounds.top"
        :width="contentBounds.width"
        :height="contentBounds.height"
      />
      <rect
        v-for="item in items"
        :key="item.id"
        :class="nodeClass(item)"
        :x="item.left"
        :y="item.top"
        :width="Math.max(6, item.width)"
        :height="Math.max(6, item.height)"
        rx="2"
      />
      <rect
        v-if="viewportRect"
        class="overview-viewport"
        :x="viewportRect.x"
        :y="viewportRect.y"
        :width="viewportRect.width"
        :height="viewportRect.height"
        rx="6"
      />
    </svg>
  </div>
</template>

<style scoped>
.canvas-minimap-overview {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 12;
  overflow: hidden;
  border: 1px solid rgba(190, 190, 190, 0.34);
  border-radius: 14px;
  background: rgba(20, 20, 20, 0.78);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
}

.canvas-minimap-overview svg {
  display: block;
  cursor: pointer;
}

.overview-bg {
  fill: rgba(10, 10, 10, 0.42);
}

.overview-node {
  fill: rgba(148, 163, 184, 0.62);
  stroke: rgba(255, 255, 255, 0.34);
  stroke-width: 10;
  vector-effect: non-scaling-stroke;
}

.overview-node.is-video { fill: rgba(244, 114, 182, 0.66); }
.overview-node.is-audio { fill: rgba(251, 191, 36, 0.66); }
.overview-node.is-text { fill: rgba(125, 211, 252, 0.66); }
.overview-node.is-group { fill: transparent; stroke: rgba(255, 255, 255, 0.55); }

.overview-viewport {
  fill: rgba(255, 255, 255, 0.08);
  stroke: rgba(255, 255, 255, 0.86);
  stroke-width: 18;
  vector-effect: non-scaling-stroke;
}

:root.canvas-theme-light .canvas-minimap-overview {
  border-color: rgba(20, 20, 20, 0.18);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
}

:root.canvas-theme-light .overview-bg {
  fill: rgba(245, 245, 245, 0.82);
}

:root.canvas-theme-light .overview-viewport {
  fill: rgba(0, 0, 0, 0.04);
  stroke: rgba(20, 20, 20, 0.78);
}
</style>

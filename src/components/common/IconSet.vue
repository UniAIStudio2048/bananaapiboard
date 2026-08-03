<script>
/**
 * IconSet — 集中式内联 SVG 图标组件（业务/品牌图标轨道）
 *
 * 与 @lucide/vue 双轨并存：
 * - A 轨 lucide：通用操作图标（工具栏、面板头、按钮、空状态）
 * - B 轨 IconSet：业务/品牌图标（节点类型、特色功能、品牌触点）
 *
 * 数据源：
 * - feature-icons.js（getFeatureIcon / iconList）——特色功能图标
 * - NODE_ICON_DATA —— 节点类型图标映射（线性描边风格，替代 emoji/字符）
 *
 * 非模板场景可直接 import 具名导出：
 *   import { nodeTypeIcon, getIconData } from '@/components/common/IconSet'
 */
import { getFeatureIcon } from '@/utils/feature-icons'

/** 把 feature-icons 条目归一化为统一渲染结构 */
function fromFeature(name) {
  const data = getFeatureIcon(name)
  if (!data) return null
  return {
    paths: data.paths || [],
    circles: data.circles || [],
    lines: data.lines || [],
    rects: data.rects || [],
    polylines: data.polylines || [],
    polygons: data.polygons || []
  }
}

/**
 * 节点类型图标映射
 * 线性描边风格：stroke=currentColor、stroke-width 1.8~2、viewBox 0 0 24 24
 * 可直接复用 feature-icons 的图标，缺的在此补画。
 */
export const NODE_ICON_DATA = {
  text: fromFeature('type'),
  image: fromFeature('image'),
  video: fromFeature('video'),
  audio: fromFeature('music'),
  llm: fromFeature('brain'),
  preview: fromFeature('eye'),
  group: fromFeature('layers'),
  director: fromFeature('clapperboard'),
  storyboard: fromFeature('grid'),
  'storyboard-grid': fromFeature('grid'),
  'grid-preview': fromFeature('grid'),
  'text-image': fromFeature('txt2img'),
  'image-edit': fromFeature('img2img'),
  repaint: fromFeature('paintbrush'),
  upscale: fromFeature('upscale'),
  cutout: fromFeature('scissors'),
  'video-edit': fromFeature('film'),
  // —— 以下为补画的线性描边图标 ——
  character: {
    paths: ['M4.5 20a7.5 7.5 0 0 1 15 0'],
    circles: [[12, 7.5, 3.5]]
  },
  'digital-human': {
    paths: [
      'M4.5 20a7.5 7.5 0 0 1 15 0',
      'M17.5 3.5l.7 1.8L20 6l-1.8.7-.7 1.8-.7-1.8L15 6l1.8-.7.7-1.8z'
    ],
    circles: [[12, 7.5, 3.5]]
  },
  'seedance-character': {
    paths: [
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      'M22 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75'
    ],
    circles: [[9, 7, 4]]
  },
  'text-video': {
    paths: ['M4 6h9', 'M8.5 6v8'],
    polygons: ['15 13 21 17 15 21 15 13']
  },
  'image-video': {
    paths: ['M2.5 13l2-2 2 2', 'M7.5 13l1.5-1.5 2 2'],
    circles: [[6, 6.5, 1]],
    rects: [[2.5, 3.5, 10, 10, 1.5]],
    polygons: ['16 7 22 10.5 16 14 16 7']
  },
  'image-describe': {
    paths: [
      'M6 15l2.5-2.5 2.5 2.5 3.5-3.5',
      'M18 5l.6 1.4L20 7l-1.4.6L18 9l-.6-1.4L16 7l1.4-.6L18 5z'
    ],
    circles: [[7, 7, 1]],
    rects: [[3, 3, 18, 18, 2]]
  },
  expand: {
    paths: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5']
  },
  eraser: {
    paths: [
      'm7 21-4.3-4.3a2.41 2.41 0 0 1 0-3.4l9.6-9.6a2.41 2.41 0 0 1 3.4 0l5.6 5.6a2.41 2.41 0 0 1 0 3.4L13.4 21H7Z',
      'M22 21H7',
      'm5 11 9 9'
    ]
  },
  'image-expand': {
    paths: [
      'M3 11.5l2-2 2 2',
      'M8 8.5l1-1 1.5 1.5',
      'M16 16h5v-5',
      'M21 16l-4-4'
    ],
    circles: [[5.5, 5.5, 0.9]],
    rects: [[3, 3, 10, 10, 1.5]]
  },
  'last-frame': {
    paths: [],
    lines: [[15, 4, 15, 20]],
    rects: [[2, 3, 20, 18, 2]]
  },
  'video-describe': {
    paths: [
      'm16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11',
      'M6 4l.7 1.7 1.8.8-1.8.7L6 9l-.7-1.8L3.5 6.5l1.8-.8L6 4z'
    ],
    rects: [[2, 6, 14, 12, 2]]
  },
  'video-extend': {
    paths: [
      'm16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11',
      'M21 3v3',
      'M19.5 4.5h3'
    ],
    rects: [[2, 6, 14, 12, 2]]
  },
  'audio-video': {
    paths: [],
    lines: [[3, 10, 3, 14], [7, 8, 7, 16], [11, 6, 11, 18]],
    polygons: ['15 7 21 12 15 17 15 7']
  },
  'audio-text': {
    paths: ['M14 17l3-8 3 8', 'M15 14h4'],
    lines: [[3, 10, 3, 14], [7, 8, 7, 16]]
  },
  'lip-sync': {
    paths: ['M14 13c1.6 2.2 4.4 2.2 6 0'],
    lines: [[3, 10, 3, 14], [7, 8, 7, 16], [11, 9, 11, 15]]
  }
}

/**
 * 获取任意图标（节点类型映射优先，其次 feature-icons）的完整 SVG 数据。
 * @param {string} name 图标名
 * @returns {{paths: string[], circles: Array, lines: Array, rects: Array, polylines: Array, polygons: Array} | null}
 */
export function getIconData(name) {
  if (!name) return null
  return NODE_ICON_DATA[name] || getFeatureIcon(name) || null
}

/**
 * 获取节点类型图标数据（nodeTypes.js 的 icon 字段值 → 线性描边 SVG 数据）。
 * @param {string} name 节点类型图标名
 */
export function nodeTypeIcon(name) {
  return getIconData(name)
}
</script>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  size: {
    type: [Number, String],
    default: 20
  },
  class: {
    type: [String, Array, Object],
    default: ''
  },
  strokeWidth: {
    type: [Number, String],
    default: 2
  }
})

const iconData = computed(() => getIconData(props.name))
</script>

<template>
  <svg
    v-if="iconData"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :class="class"
    :stroke-width="strokeWidth"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(p, i) in iconData.paths || []" :key="'p' + i" :d="p" />
    <circle
      v-for="(c, i) in iconData.circles || []"
      :key="'c' + i"
      :cx="c[0]"
      :cy="c[1]"
      :r="c[2]"
    />
    <line
      v-for="(l, i) in iconData.lines || []"
      :key="'l' + i"
      :x1="l[0]"
      :y1="l[1]"
      :x2="l[2]"
      :y2="l[3]"
    />
    <rect
      v-for="(r, i) in iconData.rects || []"
      :key="'r' + i"
      :x="r[0]"
      :y="r[1]"
      :width="r[2]"
      :height="r[3]"
      :rx="r[4]"
    />
    <polyline
      v-for="(pl, i) in iconData.polylines || []"
      :key="'pl' + i"
      :points="pl"
    />
    <polygon
      v-for="(pg, i) in iconData.polygons || []"
      :key="'pg' + i"
      :points="pg"
    />
  </svg>
</template>

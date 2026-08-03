<script setup>
/**
 * NodeShell.vue - 画布节点虚拟化轻骨架
 *
 * 用于 1000+ 节点画布的真虚拟化：当节点处于画布视口外，
 * 由 VirtualizedNode HOC 将真组件替换为本组件，避免挂载
 * 重量级节点（ImageNode 11816 行、TextNode 5604 行等）。
 *
 * 设计准则（不可妥协）：
 *   - 不连接 Pinia store
 *   - 不订阅 useVueFlow 任何响应式状态
 *   - 不挂载 Handle / 配置面板 / 上传 / 工具栏
 *   - 只读取 props.data 中的极少字段：title / status
 *   - 模板极简，<60 行 DOM
 *
 * 品牌视觉统一（阶段D）：头部统一为「类型图标 + 类别点 + 标题 + 状态徽标」，
 * 三态/选中态样式收敛在 canvas.css 的 .canvas-node-shell 规则（统一 token）。
 */
import { computed } from 'vue'
import { NODE_TYPE_CONFIG, NODE_CATEGORIES } from '@/config/canvas/nodeTypes'
import IconSet from '@/components/common/IconSet.vue'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, default: () => ({}) },
  type: { type: String, default: '' },
  selected: { type: Boolean, default: false }
})

const title = computed(() => {
  const t = props.data?.title
  if (typeof t === 'string' && t.length) return t
  return ''
})

const status = computed(() => props.data?.status || 'idle')

// 节点类型配置（icon/category/color 来自 nodeTypes.js，静态读取）
const typeConfig = computed(() => NODE_TYPE_CONFIG[props.type] || null)

// 别名节点类型 → 规范图标名（画布统一注册的 'image'/'video'/'llm' 等）
const TYPE_ICON_ALIAS = {
  image: 'image',
  'image-gen': 'image',
  video: 'video',
  'video-gen': 'video',
  audio: 'audio',
  llm: 'llm',
  'character-card': 'character',
  'bytefor-character': 'seedance-character'
}

// NODE_CATEGORIES 未覆盖的类别兜底中文名
const FALLBACK_CATEGORY_LABELS = { edit: '编辑', video: '视频', character: '角色', 'seedance-character': '角色' }

const iconName = computed(() => {
  if (typeConfig.value?.icon) return typeConfig.value.icon
  return TYPE_ICON_ALIAS[props.type] || 'preview'
})

// 类别：优先 NODE_CATEGORIES.label，其次兜底映射，最后用类别键
const categoryKey = computed(() => {
  const cfg = typeConfig.value
  return cfg?.category || TYPE_ICON_ALIAS[props.type] || 'input'
})

const categoryLabel = computed(
  () => NODE_CATEGORIES[categoryKey.value]?.label || FALLBACK_CATEGORY_LABELS[categoryKey.value] || categoryKey.value
)

const categoryColor = computed(() => typeConfig.value?.color || '#8b8b8b')

// 状态徽标文案与语义色（对齐 canvas.css 的 --canvas-accent-* token）
const statusBadge = computed(() => {
  const s = status.value
  if (s === 'running' || s === 'processing') return { text: '运行中', cls: 'shell-status-running' }
  if (s === 'completed' || s === 'success') return { text: '完成', cls: 'shell-status-success' }
  if (s === 'failed' || s === 'error') return { text: '失败', cls: 'shell-status-error' }
  return null
})

const categoryClass = computed(() => `shell-cat-${categoryKey.value}`)
</script>

<template>
  <div
    class="canvas-node-shell"
    :class="[categoryClass, { 'shell-selected': selected }]"
    :data-shell-status="status"
    :data-shell-node-id="id"
  >
    <div class="shell-header">
      <span class="shell-icon">
        <IconSet :name="iconName" :size="16" :stroke-width="1.8" />
      </span>
      <span class="shell-category">
        <span class="shell-category-dot" :style="{ background: categoryColor }"></span>
        {{ categoryLabel }}
      </span>
      <span class="shell-title">{{ title || '节点' }}</span>
      <span v-if="statusBadge" class="shell-status" :class="statusBadge.cls">{{ statusBadge.text }}</span>
    </div>
    <div class="shell-body" />
  </div>
</template>

<style scoped>
.canvas-node-shell {
  width: 380px;
  min-height: 200px;
  background: var(--canvas-bg-secondary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  contain: layout style;
  /* shell 不响应鼠标，避免拦截画布右键菜单等事件；
     真组件挂载后会接管交互 */
  pointer-events: none;
  opacity: 0.55;
}

.shell-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--canvas-border-subtle, rgba(255, 255, 255, 0.05));
}

/* 类型图标：16px 圆角方块底（surface-2）+ SVG 线性图标 */
.shell-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--canvas-bg-tertiary, #242424);
  border: 1px solid var(--canvas-border-subtle, rgba(255, 255, 255, 0.06));
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.65));
}

/* 类别标识：彩色小圆点 + 类别名（caption 级） */
.shell-category {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--canvas-text-tertiary, rgba(255, 255, 255, 0.45));
  flex-shrink: 0;
}

.shell-category-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.shell-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

/* 状态徽标（右侧，语义色，对齐 canvas.css token） */
.shell-status {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1.4;
  padding: 1px 6px;
  border-radius: 9999px;
}

.shell-status-running {
  color: var(--canvas-accent-warning, #f59e0b);
  background: rgba(245, 158, 11, 0.15);
}

.shell-status-success {
  color: var(--canvas-accent-success, #22c55e);
  background: rgba(34, 197, 94, 0.15);
}

.shell-status-error {
  color: var(--canvas-accent-error, #ef4444);
  background: rgba(239, 68, 68, 0.15);
}

.shell-body {
  flex: 1;
  min-height: 150px;
  margin: 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
}
</style>

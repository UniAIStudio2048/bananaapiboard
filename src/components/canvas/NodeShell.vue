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
 */
import { computed } from 'vue'

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

// 简化节点类型到一类标签（用 CSS 区分颜色），不做图标精细化
const categoryLabel = computed(() => {
  const t = String(props.type || '').toLowerCase()
  if (t.includes('image')) return 'IMG'
  if (t.includes('video')) return 'VID'
  if (t.includes('audio')) return 'AUD'
  if (t.includes('llm')) return 'LLM'
  if (t.includes('text')) return 'TXT'
  if (t.includes('preview')) return 'PRV'
  if (t.includes('character')) return 'CHR'
  if (t.includes('storyboard')) return 'SB'
  return 'NODE'
})

const categoryClass = computed(() => `shell-cat-${categoryLabel.value.toLowerCase()}`)
</script>

<template>
  <div
    class="canvas-node-shell"
    :class="[categoryClass, { 'shell-selected': selected }]"
    :data-shell-status="status"
    :data-shell-node-id="id"
  >
    <div class="shell-header">
      <span class="shell-badge">{{ categoryLabel }}</span>
      <span class="shell-title">{{ title || '节点' }}</span>
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

.shell-badge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
  flex-shrink: 0;
}

.shell-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.shell-body {
  flex: 1;
  min-height: 150px;
  margin: 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
}

/* 状态色（与现有节点状态色对齐） */
.canvas-node-shell[data-shell-status='running'] {
  border-color: var(--canvas-color-accent, #3b82f6);
}
.canvas-node-shell[data-shell-status='completed'],
.canvas-node-shell[data-shell-status='success'] {
  border-color: var(--canvas-color-success, #10b981);
}
.canvas-node-shell[data-shell-status='failed'],
.canvas-node-shell[data-shell-status='error'] {
  border-color: var(--canvas-color-danger, #ef4444);
}

/* 不同类型用极淡的色相区分（便于扫视画布全景） */
.shell-cat-img .shell-badge { color: rgba(96, 165, 250, 0.85); }
.shell-cat-vid .shell-badge { color: rgba(244, 114, 182, 0.85); }
.shell-cat-aud .shell-badge { color: rgba(251, 191, 36, 0.85); }
.shell-cat-llm .shell-badge { color: rgba(167, 139, 250, 0.85); }
.shell-cat-txt .shell-badge { color: rgba(148, 163, 184, 0.85); }
.shell-cat-prv .shell-badge { color: rgba(52, 211, 153, 0.85); }

/* 即使虚拟化下被选中（理论上不会出现，因为 HOC 会切回真组件），仍提供选中样式作兜底 */
.canvas-node-shell.shell-selected {
  opacity: 0.85;
  border-color: var(--canvas-color-accent, #3b82f6);
}
</style>

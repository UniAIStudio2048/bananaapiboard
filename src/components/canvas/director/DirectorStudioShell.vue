<script setup>
defineProps({
  nodeId: { type: String, required: true },
  data: { type: Object, default: () => ({}) },
  items: { type: Array, default: () => [] },
  referenceImages: { type: Array, default: () => [] },
  selectedItemId: { type: [String, Number], default: null }
})

const emit = defineEmits(['close', 'update:selectedItemId'])
</script>

<template>
  <div class="director-shell-backdrop nodrag nopan" @click.self="emit('close')">
    <section class="director-shell" @click.stop>
      <header class="director-shell-header">
        <div>
          <p class="director-shell-eyebrow">Director Studio</p>
          <h2>{{ data.title || '导演台' }}</h2>
        </div>
        <button type="button" class="director-shell-close nodrag nopan" @click.stop="emit('close')">
          关闭
        </button>
      </header>

      <div class="director-shell-body">
        <p>导演台编辑器将在后续任务中接入。</p>
        <div class="director-shell-stats">
          <span>项目 {{ data.directorStudioProjects?.length || 0 }}</span>
          <span>镜头 {{ items.length }}</span>
          <span>参考 {{ referenceImages.length }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.director-shell-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.58);
  cursor: default;
}

.director-shell {
  width: min(720px, calc(100vw - 48px));
  min-height: 280px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: #18181b;
  color: #f4f4f5;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.director-shell-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.director-shell-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0;
  color: #a1a1aa;
  text-transform: uppercase;
}

.director-shell-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
}

.director-shell-close {
  flex: none;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #f4f4f5;
  font-size: 13px;
  cursor: pointer;
}

.director-shell-close:hover {
  background: rgba(255, 255, 255, 0.1);
}

.director-shell-body {
  padding: 20px;
  color: #d4d4d8;
  font-size: 14px;
}

.director-shell-body p {
  margin: 0 0 16px;
}

.director-shell-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.director-shell-stats span {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
  font-size: 12px;
}
</style>

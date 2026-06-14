<script setup>
import { computed } from 'vue'
import { X } from '@lucide/vue'
import { useDirectorStudioI18n } from './useDirectorStudioI18n.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  shortcuts: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close'])
const { dt } = useDirectorStudioI18n()

const shortcutRows = computed(() => [
  [dt('shortcuts.moveTool', '移动工具'), props.shortcuts.transformMove || '1'],
  [dt('shortcuts.rotateTool', '旋转工具'), props.shortcuts.transformRotate || '2'],
  [dt('shortcuts.scaleTool', '缩放工具'), props.shortcuts.transformScale || '3'],
  [dt('shortcuts.focusSelected', '聚焦选中'), props.shortcuts.focus || 'F'],
  [dt('shortcuts.fitScene', '适配场景'), props.shortcuts.fit || 'Z'],
  [dt('shortcuts.resetCamera', '重置镜头'), props.shortcuts.reset || 'R'],
  [dt('shortcuts.captureScreenshot', '截图'), props.shortcuts.screenshot || 'C'],
  [dt('shortcuts.modelLibrary', '模型库'), props.shortcuts.model || 'M'],
  [dt('shortcuts.lightingPanel', '灯光面板'), props.shortcuts.lighting || 'L'],
  [dt('shortcuts.gridPanel', '网格面板'), props.shortcuts.grid || 'G'],
  [dt('shortcuts.promptPanel', '提示词面板'), props.shortcuts.prompt || 'P'],
  [dt('shortcuts.shortcuts', '快捷键'), props.shortcuts.shortcuts || 'H'],
  [dt('shortcuts.saveProject', '保存项目'), props.shortcuts.save || 'Cmd/Ctrl+S'],
  [dt('shortcuts.deleteSelected', '删除选中'), props.shortcuts.delete || 'Delete'],
  [dt('shortcuts.copySelected', '复制选中'), props.shortcuts.copy || 'Cmd/Ctrl+C'],
  [dt('shortcuts.pasteItem', '粘贴元素'), props.shortcuts.paste || 'Cmd/Ctrl+V'],
  [dt('shortcuts.undoItemOperation', '撤销元素操作'), props.shortcuts.undo || 'Cmd/Ctrl+Z'],
  [dt('shortcuts.redoItemOperation', '重做元素操作'), props.shortcuts.redo || 'Cmd/Ctrl+Shift+Z']
])
</script>

<template>
  <div v-if="open" class="director-shortcut-backdrop" @click.self="emit('close')">
    <section class="director-shortcut-dialog" role="dialog" aria-modal="true" :aria-label="dt('shortcuts.dialogLabel', '导演台快捷键')">
      <header>
        <h2>{{ dt('shortcuts.title', '快捷键') }}</h2>
        <button type="button" :title="dt('shortcuts.close', '关闭快捷键')" @click="emit('close')">
          <X :size="17" stroke-width="2" />
        </button>
      </header>
      <div class="director-shortcut-list">
        <div v-for="[label, shortcut] in shortcutRows" :key="label" class="director-shortcut-row">
          <span>{{ label }}</span>
          <kbd>{{ shortcut }}</kbd>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.director-shortcut-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.48);
}

.director-shortcut-dialog {
  width: min(520px, calc(100vw - 32px));
  max-height: min(680px, calc(100vh - 48px));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: #15171a;
  color: #f4f4f5;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48);
  overflow: hidden;
}

.director-shortcut-dialog header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.director-shortcut-dialog h2 {
  margin: 0;
  font-size: 14px;
  line-height: 1.2;
}

.director-shortcut-dialog button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #24272d;
  color: #d4d4d8;
  cursor: pointer;
}

.director-shortcut-list {
  display: grid;
  max-height: 560px;
  overflow: auto;
}

.director-shortcut-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  min-height: 34px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.director-shortcut-row span {
  color: #d4d4d8;
  font-size: 12px;
}

.director-shortcut-row kbd {
  min-width: 42px;
  padding: 3px 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  background: #0f1114;
  color: #a5f3fc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  text-align: center;
}
</style>

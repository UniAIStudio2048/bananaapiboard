<script setup>
import { ref, computed, watch } from 'vue'
import { useTeamStore } from '@/stores/team'
import { copyAssetsToSpace } from '@/api/canvas/assets'

const props = defineProps({
  visible: Boolean,
  items: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'success'])

const teamStore = useTeamStore()

const selectedSpace = ref(null)
const copying = ref(false)
const errorMsg = ref('')

const availableSpaces = computed(() => {
  return teamStore.getAllSpaces()
})

function isCurrentSpace(space) {
  if (space.type === 'personal' && teamStore.globalSpaceType.value === 'personal') {
    return true
  }
  if (space.type === 'team' && teamStore.globalSpaceType.value === 'team' && space.teamId === teamStore.globalTeamId.value) {
    return true
  }
  return false
}

function selectSpace(space) {
  if (isCurrentSpace(space)) return
  selectedSpace.value = space.id
}

function close() {
  if (copying.value) return
  emit('update:visible', false)
  resetState()
}

function resetState() {
  selectedSpace.value = null
  copying.value = false
  errorMsg.value = ''
}

async function handleCopy() {
  if (!selectedSpace.value || copying.value) return

  const space = availableSpaces.value.find(s => s.id === selectedSpace.value)
  if (!space) return

  const targetSpaceType = space.type
  const targetTeamId = space.type === 'team' ? space.teamId : null

  copying.value = true
  errorMsg.value = ''

  try {
    await copyAssetsToSpace(props.items, targetSpaceType, targetTeamId)
    emit('success')
    close()
  } catch (err) {
    errorMsg.value = err.message || '复制失败'
  } finally {
    copying.value = false
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    resetState()
    if (teamStore.myTeams.value.length === 0) {
      teamStore.loadMyTeams()
    }
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="copy-dialog-overlay" @click.self="close">
        <div class="copy-dialog">
          <div class="dialog-header">
            <div class="header-left">
              <h3>复制到空间</h3>
              <span class="item-count">{{ items.length }} 个项目</span>
            </div>
            <button class="close-btn" @click="close">×</button>
          </div>
          <div class="dialog-body">
            <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
            <div class="space-list">
              <div 
                v-for="space in availableSpaces" 
                :key="space.id"
                :class="['space-item', { selected: selectedSpace === space.id, disabled: isCurrentSpace(space) }]"
                @click="selectSpace(space)"
              >
                <span class="space-icon">{{ space.icon }}</span>
                <span class="space-name">{{ space.name }}</span>
                <span v-if="space.type === 'team'" class="member-count">{{ space.memberCount }}人</span>
                <span v-if="isCurrentSpace(space)" class="current-tag">当前</span>
                <span v-if="selectedSpace === space.id" class="check-mark">✓</span>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="cancel-btn" @click="close" :disabled="copying">取消</button>
            <button class="confirm-btn" @click="handleCopy" :disabled="!selectedSpace || copying">
              {{ copying ? '复制中...' : '确认复制' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.copy-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copy-dialog {
  background: #1a1a2e;
  border-radius: 12px;
  min-width: 360px;
  max-width: 420px;
  width: 90%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e0;
}

.item-count {
  font-size: 12px;
  color: #888;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 8px;
  border-radius: 10px;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #fff;
}

.dialog-body {
  padding: 12px 16px;
  max-height: 400px;
  overflow-y: auto;
}

.dialog-body::-webkit-scrollbar {
  width: 4px;
}

.dialog-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.error-msg {
  padding: 8px 12px;
  margin-bottom: 8px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  font-size: 13px;
}

.space-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.space-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  gap: 10px;
}

.space-item:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.05);
}

.space-item.selected {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.5);
}

.space-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.space-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.space-name {
  flex: 1;
  color: #e0e0e0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-count {
  font-size: 12px;
  color: #666;
  flex-shrink: 0;
}

.current-tag {
  font-size: 11px;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.check-mark {
  color: #6366f1;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.cancel-btn {
  background: transparent;
  color: #999;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.cancel-btn:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.4);
  color: #ccc;
}

.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirm-btn {
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.confirm-btn:hover:not(:disabled) {
  background: #5558e6;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Transition */
.modal-enter-active {
  transition: opacity 0.25s ease;
}

.modal-enter-active .copy-dialog {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-leave-active .copy-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from {
  opacity: 0;
}

.modal-enter-from .copy-dialog {
  transform: scale(0.95);
  opacity: 0;
}

.modal-leave-to {
  opacity: 0;
}

.modal-leave-to .copy-dialog {
  transform: scale(0.95);
  opacity: 0;
}
</style>

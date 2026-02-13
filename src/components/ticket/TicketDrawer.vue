<template>
  <Transition name="modal">
    <div v-if="visible" class="modal-overlay" @click="$emit('close')">
      <div class="modal-container" @click.stop>
        <!-- 内容插槽 -->
        <slot></slot>
      </div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

defineEmits(['close'])
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-container {
  position: relative;
  width: 520px;
  max-width: 90vw;
  height: 80vh;
  background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 640px) {
  .modal-container {
    width: 95vw;
    height: 90vh;
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.25s, opacity 0.25s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
  opacity: 0;
}
</style>

<style>
/* ========== TicketDrawer 白昼模式 ========== */
html.canvas-theme-light .modal-overlay.modal-overlay {
  background: rgba(0, 0, 0, 0.4) !important;
}
html.canvas-theme-light .modal-container.modal-container {
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%) !important;
  border-color: rgba(0, 0, 0, 0.12) !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
}
</style>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
    :class="buttonClass"
    :disabled="disabled"
    :aria-disabled="disabled || !canMessage"
    @click="handleClick"
  >
    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z" />
    </svg>
    <span>{{ canMessage ? '私信' : '互关后可私信' }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  userId: { type: String, required: true },
  canMessage: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['open', 'login-required'])

const buttonClass = computed(() => {
  if (props.canMessage) {
    return 'border-white/15 bg-white/5 text-white hover:bg-white/10'
  }
  return 'border-white/10 bg-transparent text-white/40'
})

function handleClick() {
  if (props.disabled) return

  if (!localStorage.getItem('token')) {
    emit('login-required')
    return
  }

  if (!props.canMessage) {
    return
  }

  emit('open', props.userId)
}
</script>

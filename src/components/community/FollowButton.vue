<template>
  <button
    type="button"
    class="inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
    :class="[sizeClass, buttonClass]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading">处理中...</span>
    <template v-else>
      <svg v-if="isMutual" :class="iconClass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5V9H2v11h5m10 0v-4a3 3 0 00-3-3H10a3 3 0 00-3 3v4m10 0H7m10 0h1m-11 0H6m6-12a3 3 0 110 6 3 3 0 010-6z" />
      </svg>
      <svg v-else-if="isFollowing" :class="iconClass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <svg v-else :class="iconClass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v6m3-3h-6M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293l-1.828-1.828A1 1 0 0012.172 3H5a2 2 0 00-2 2v13a2 2 0 002 2z" />
      </svg>
      <span>{{ buttonText }}</span>
    </template>
  </button>
</template>

<script setup>
import { computed, ref } from 'vue'
import { toggleFollow } from '@/api/community'

const props = defineProps({
  userId: { type: String, required: true },
  initialFollowing: { type: Boolean, default: false },
  initialMutual: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  size: { type: String, default: 'default' }
})

const emit = defineEmits(['changed', 'login-required'])

const loading = ref(false)
const isFollowing = ref(props.initialFollowing)
const isMutual = ref(props.initialMutual)

const sizeClass = computed(() => {
  if (props.size === 'small') return 'px-3 py-1 text-xs'
  return 'px-4 py-2 text-sm'
})

const iconClass = computed(() => {
  if (props.size === 'small') return 'h-3 w-3'
  return 'h-4 w-4'
})

const buttonText = computed(() => {
  if (isMutual.value) return '互相关注'
  if (isFollowing.value) return '已关注'
  return '关注'
})

const buttonClass = computed(() => {
  if (isMutual.value) {
    return 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
  }
  if (isFollowing.value) {
    return 'border border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
  }
  return 'bg-white text-black hover:bg-white/90'
})

function isAuthError(error) {
  const message = String(error?.message || error?.data?.message || error?.data?.error || '')
  return error?.status === 401 || error?.status === 403 || message.includes('请先登录')
}

async function handleClick() {
  if (!localStorage.getItem('token')) {
    emit('login-required')
    return
  }

  loading.value = true
  try {
    const result = await toggleFollow(props.userId)
    const nextState = result?.data || result || {}
    const nextPayload = {
      isFollowing: !!nextState.is_following,
      isMutual: !!nextState.is_mutual_follow,
      is_following: !!nextState.is_following,
      is_mutual_follow: !!nextState.is_mutual_follow
    }
    isFollowing.value = nextPayload.isFollowing
    isMutual.value = nextPayload.isMutual
    emit('changed', nextPayload)
  } catch (error) {
    if (isAuthError(error)) {
      emit('login-required')
      return
    }
    console.error('[FollowButton] 关注操作失败:', error)
  } finally {
    loading.value = false
  }
}
</script>

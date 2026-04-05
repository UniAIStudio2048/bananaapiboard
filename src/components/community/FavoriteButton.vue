<template>
  <button
    type="button"
    class="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <svg
      class="h-4 w-4 transition-colors"
      :class="isFavorited ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-white/80'"
      stroke="currentColor"
      viewBox="0 0 24 24"
      stroke-width="2"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 5.5A2.5 2.5 0 017.5 3h9A2.5 2.5 0 0119 5.5v15a.5.5 0 01-.79.407L12 16.5l-6.21 4.407A.5.5 0 015 20.5v-15z" />
    </svg>
    <span>{{ loading ? '处理中...' : (isFavorited ? '已收藏' : '收藏') }}</span>
    <span v-if="displayCount > 0" class="text-xs text-white/60">{{ displayCount }}</span>
  </button>
</template>

<script setup>
import { computed, ref } from 'vue'
import { toggleFavorite } from '@/api/community'

const props = defineProps({
  workId: { type: [String, Number], required: true },
  initialFavorited: { type: Boolean, default: false },
  count: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['changed', 'login-required'])

const loading = ref(false)
const isFavorited = ref(props.initialFavorited)
const favoriteCount = ref(Number(props.count || 0))

const displayCount = computed(() => Math.max(0, favoriteCount.value))

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
    const result = await toggleFavorite(props.workId)
    const nextState = result?.data || result || {}
    const nextPayload = {
      isFavorited: !!(nextState.is_favorited ?? nextState.favorited),
      favoriteCount: Number(nextState.favorite_count ?? favoriteCount.value),
      is_favorited: !!(nextState.is_favorited ?? nextState.favorited),
      favorite_count: Number(nextState.favorite_count ?? favoriteCount.value)
    }
    isFavorited.value = nextPayload.isFavorited
    favoriteCount.value = nextPayload.favoriteCount
    emit('changed', nextPayload)
  } catch (error) {
    if (isAuthError(error)) {
      emit('login-required')
      return
    }
    throw error
  } finally {
    loading.value = false
  }
}
</script>

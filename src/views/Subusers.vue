<script setup>
import { onMounted, ref } from 'vue'
import SubuserPanel from '@/components/SubuserPanel.vue'
import { apiRequest, getMe } from '@/api/client'
const me = ref(null)
const loading = ref(true)
onMounted(async () => {
  try { me.value = await getMe(true) } finally { loading.value = false }
})
async function send(path, options) {
  const result = await apiRequest(path, options)
  if (options?.method && options.method !== 'GET') window.dispatchEvent(new CustomEvent('user-info-updated'))
  return result
}
</script>
<template>
  <p v-if="loading" class="p-6" role="status">正在加载…</p>
  <SubuserPanel v-else-if="me && !me.is_subuser" :request="send" />
  <p v-else class="p-6" role="alert">{{ me?.is_subuser ? '子用户不能创建或管理子用户' : '请先登录后管理子用户' }}</p>
</template>

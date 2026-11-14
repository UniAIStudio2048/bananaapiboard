<script setup>
import { t as translateUi } from '@/i18n'

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
  <p v-if="loading" class="p-6" role="status">{{ translateUi('uiMessages.m21bd738e0d71') }}</p>
  <SubuserPanel v-else-if="me && !me.is_subuser" :request="send" />
  <p v-else class="p-6" role="alert">{{ me?.is_subuser ? translateUi('uiMessages.me770da86d88e') : translateUi('uiMessages.m1a0f21419a44') }}</p>
</template>

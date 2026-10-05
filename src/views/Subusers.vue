<script setup>
import SubuserPanel from '@/components/SubuserPanel.vue'
import { apiRequest } from '@/api/client'
async function send(path, options) {
  const result = await apiRequest(path, options)
  if (options?.method && options.method !== 'GET') window.dispatchEvent(new CustomEvent('user-info-updated'))
  return result
}
</script>
<template><SubuserPanel :request="send" /></template>

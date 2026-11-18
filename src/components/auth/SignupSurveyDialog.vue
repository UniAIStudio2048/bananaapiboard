<script setup>
import { computed, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { t } from '@/i18n'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { signupSurveyRequest } from '@/utils/signupSurvey'

const dialog = ref(null)
const answer = ref('')
const saving = ref(false)
const error = ref('')
const reward = computed(() => signupSurveyRequest.value?.result.signup_survey.reward_points || 0)
const options = {
  search: 'uiMessages.m82cbe72ab9d9',
  ai: 'signupSurvey.ai',
  douyin: 'uiMessages.md077d0b18e19',
  xiaohongshu: 'uiMessages.md26c6a08a591',
  bilibili: 'uiMessages.macfb839ad1e4',
  xianyu: 'uiMessages.m6586c26399cf',
  wechat: 'signupSurvey.wechat',
  friend: 'uiMessages.m783a119b9763',
  other: 'uiMessages.md290f1647e7'
}

watch(signupSurveyRequest, request => {
  if (!request) return
  answer.value = ''
  error.value = ''
  dialog.value.showModal()
}, { flush: 'post' })

function finish() {
  const request = signupSurveyRequest.value
  signupSurveyRequest.value = null
  request?.resolve()
}

async function submit() {
  const request = signupSurveyRequest.value
  if (!request || !answer.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const response = await fetch(getApiUrl('/api/auth/signup-survey'), {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json', Authorization: `Bearer ${request.result.token}` },
      body: JSON.stringify({ answer: answer.value }),
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) throw new Error('signup_survey_failed')
    const result = await response.json()
    if (request.result.user) request.result.user.points = result.points
    dialog.value.close()
  } catch {
    error.value = t('signupSurvey.error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      aria-labelledby="signup-survey-title"
      class="m-auto w-11/12 max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl backdrop:bg-black/50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      @close="finish"
      @cancel="saving && $event.preventDefault()"
    >
      <form class="space-y-4" @submit.prevent="submit">
        <div class="flex items-start justify-between gap-4">
          <h2 id="signup-survey-title" class="text-lg font-semibold">{{ t('signupSurvey.title') }}</h2>
          <button type="button" :aria-label="t('signupSurvey.close')" :disabled="saving" class="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-800" @click="dialog.close()">
            <X class="size-5" />
          </button>
        </div>
        <fieldset class="space-y-2" :disabled="saving">
          <legend class="mb-1 text-sm text-gray-600 dark:text-gray-300">{{ t('uiMessages.maf70f9fc9816') }}</legend>
          <p v-if="reward > 0" class="text-sm text-gray-600 dark:text-gray-300">{{ t('signupSurvey.reward', { points: reward }) }}</p>
          <div class="grid grid-cols-2 gap-2">
            <label v-for="(label, value) in options" :key="value" class="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <input v-model="answer" type="radio" name="signup-survey-source" :value="value" />
              {{ t(label) }}
            </label>
          </div>
        </fieldset>
        <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800" :disabled="saving" @click="dialog.close()">{{ t('signupSurvey.skip') }}</button>
          <button type="submit" class="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900" :disabled="!answer || saving">{{ t(saving ? 'signupSurvey.saving' : 'signupSurvey.submit') }}</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

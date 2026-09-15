import { computed, onMounted, ref, watch } from 'vue'
import { smsRequest } from '@/api/sms'
import { useI18n } from '@/i18n'
import { smsCopy } from '@/utils/smsCopy'

export function useSmsCopy() {
  const { currentLanguage } = useI18n()
  return computed(() => smsCopy(currentLanguage.value))
}
export function useSmsAuth(mode, resetMode, visible = null) {
  const policy = ref({ registration_enabled: false, registration_mode: 'none', sms: {} })
  const policyError = ref(false)
  const policyLoading = ref(true)
  const smsLogin = ref(false)
  const loginCountry = ref('CN')
  const loginCountries = computed(() => [...new Set(['CN', ...Object.values(policy.value.sms || {}).flat()])])
  const copy = useSmsCopy()
  let policyRequest = 0
  const showSmsMethod = computed(() => !policyLoading.value && !policyError.value && (resetMode.value || mode.value === 'login') && !!policy.value.sms?.[resetMode.value ? 'retrieve' : 'login']?.length)
  const phoneFormMode = computed(() => resetMode.value ? (smsLogin.value && showSmsMethod.value ? 'retrieve' : '') : mode.value === 'register' ? (policy.value.registration_mode === 'phone' ? 'register' : '') : smsLogin.value && showSmsMethod.value ? 'login' : '')
  async function loadAuthPolicy() {
    const request = ++policyRequest
    policyLoading.value = true
    try {
      const nextPolicy = await smsRequest('/api/auth/public-config')
      if (request !== policyRequest) return
      policy.value = nextPolicy
      if (!nextPolicy.sms?.[resetMode.value ? 'retrieve' : 'login']?.length) smsLogin.value = false
      if (!loginCountries.value.includes(loginCountry.value)) loginCountry.value = 'CN'
      policyError.value = false
    } catch (_) { if (request === policyRequest) { policyError.value = true; smsLogin.value = false } }
    finally { if (request === policyRequest) policyLoading.value = false }
  }
  function backToPassword() { smsLogin.value = false; resetMode.value = false; mode.value = 'login' }
  onMounted(loadAuthPolicy)
  if (visible) watch(visible, value => { if (value) { smsLogin.value = false; loadAuthPolicy() } })
  watch(mode, () => { smsLogin.value = false; loadAuthPolicy() })
  return { policy, policyError, policyLoading, smsLogin, showSmsMethod, phoneFormMode, copy, loadAuthPolicy, backToPassword, loginCountry, loginCountries }
}

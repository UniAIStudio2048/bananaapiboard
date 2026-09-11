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
  const smsLogin = ref(false)
  const copy = useSmsCopy()
  const phoneFormMode = computed(() => resetMode.value ? (smsLogin.value ? 'retrieve' : '') : mode.value === 'register' ? (policy.value.registration_mode === 'phone' ? 'register' : '') : smsLogin.value ? 'login' : '')
  async function loadAuthPolicy() {
    try {
      policy.value = await smsRequest('/api/auth/public-config')
      policyError.value = false
    } catch (_) { policyError.value = true }
  }
  function backToPassword() { smsLogin.value = false; resetMode.value = false; mode.value = 'login' }
  onMounted(loadAuthPolicy)
  if (visible) watch(visible, value => { if (value) { smsLogin.value = false; loadAuthPolicy() } })
  watch(mode, () => { smsLogin.value = false })
  return { policy, policyError, smsLogin, phoneFormMode, copy, loadAuthPolicy, backToPassword }
}

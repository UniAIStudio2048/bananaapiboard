<script setup>
import { computed, onMounted, ref } from 'vue'
import PhoneVerificationFields from './PhoneVerificationFields.vue'
import { smsRequest } from '@/api/sms'
import { useSmsCopy } from '@/composables/useSmsAuth'
import { smsErrorText } from '@/utils/smsCopy'
const emit=defineEmits(['updated'])
const copy=useSmsCopy()
const info=ref(null),policy=ref({sms:{}}),busy=ref(false),error=ref(''),message=ref('')
const verification=ref({phone:'',country:'CN',code:'',request_id:''})
const purpose=computed(()=>info.value?.phone_bound?'unbind':'bind')
const countries=computed(()=>policy.value.sms?.[purpose.value]||[])
const available=computed(()=>countries.value.length && (!info.value?.phone_bound || (info.value.can_unbind && countries.value.includes(info.value.phone_country))))
async function load(){try{[info.value,policy.value]=await Promise.all([smsRequest('/api/user/phone',undefined,true),smsRequest('/api/auth/public-config')]);error.value=''}catch(e){error.value=smsErrorText(e,copy.value)}}
async function submit(){
  if(busy.value)return
  if(!verification.value.request_id||!verification.value.code){error.value=copy.value.requiredCode;return}
  busy.value=true;error.value='';message.value=''
  const operation=purpose.value
  try{
    await smsRequest(`/api/user/phone/${operation}`,verification.value,true)
    verification.value={phone:'',country:'CN',code:'',request_id:''}
    await load()
    message.value=operation==='bind'?copy.value.bindDone:copy.value.unbindDone
    emit('updated')
  }catch(e){error.value=smsErrorText(e,copy.value)}finally{busy.value=false}
}
onMounted(load)
</script>
<template>
  <section class="phone-binding" data-testid="phone-binding">
    <header class="phone-header">
      <span class="phone-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 5h4M11 18h2" /></svg></span>
      <div class="phone-heading">
        <h4>{{ copy.phone }}</h4>
        <p v-if="info" class="phone-state" :class="{ 'is-bound': info.phone_bound }"><span class="status-dot" aria-hidden="true"></span>{{ info.phone_bound?copy.bound:copy.unbound }}</p>
      </div>
    </header>
    <p v-if="error" role="alert" class="error">{{ error }} <button type="button" @click="load">{{ copy.retry }}</button></p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <p v-if="info?.phone_bound" class="phone-hint">{{ copy.unbindHint }}</p>
    <template v-if="info && available">
      <PhoneVerificationFields :key="purpose" v-model="verification" :purpose="purpose" :countries="countries" :bound-phone="info.phone_bound?info.phone_masked:''" :busy="busy" authenticated />
      <button type="button" class="primary" :disabled="busy" @click="submit">{{ busy?copy.submitting:purpose==='bind'?copy.bind:copy.unbind }}</button>
    </template>
    <p v-else-if="info" class="phone-notice">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v2" /></svg>
      <span>{{ info.phone_bound && !info.can_unbind?copy.passwordRequired:copy.unavailable }}<span v-if="info.phone_masked" class="phone-number">{{ info.phone_masked }}</span></span>
    </p>
  </section>
</template>
<style scoped>
.phone-binding {
  --phone-surface: rgba(255, 255, 255, .04);
  --phone-border: rgba(255, 255, 255, .12);
  --phone-text: #f4f4f5;
  --phone-muted: #a1a1aa;
  --phone-input: #262626;
  --phone-accent: #6ee7b7;
  --phone-accent-bg: rgba(16, 185, 129, .1);
  --phone-primary: #34d399;
  --phone-primary-text: #052e16;
  --phone-error: #fca5a5;
  --phone-error-bg: rgba(239, 68, 68, .08);
  --sms-input-bg: var(--phone-input);
  display: grid;
  gap: 14px;
  min-width: 0;
  margin: 20px 0;
  padding: 16px;
  border: 1px solid var(--phone-border);
  border-radius: 12px;
  background: var(--phone-surface);
  color: var(--phone-text);
}
.phone-header { display: flex; align-items: center; gap: 12px; }
.phone-icon { display: grid; place-items: center; flex-shrink: 0; width: 40px; height: 40px; border-radius: 10px; background: var(--phone-accent-bg); color: var(--phone-accent); }
.phone-icon svg { width: 22px; height: 22px; }
.phone-heading { min-width: 0; }
h4, p { margin: 0; }
h4 { font-size: 14px; font-weight: 600; line-height: 20px; color: var(--phone-text); }
p { font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.phone-state { display: flex; align-items: center; gap: 6px; margin-top: 3px; color: var(--phone-muted); }
.status-dot { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: currentColor; }
.phone-state.is-bound { color: var(--phone-accent); }
.phone-hint { color: var(--phone-muted); }
.phone-notice { display: flex; align-items: flex-start; gap: 8px; padding-top: 12px; border-top: 1px solid var(--phone-border); color: var(--phone-muted); }
.phone-notice svg { flex-shrink: 0; width: 16px; height: 16px; margin-top: 2px; }
.phone-notice > span { min-width: 0; }
.phone-number { display: block; margin-top: 6px; font-size: 14px; font-weight: 600; color: var(--phone-text); }
button { min-height: 40px; padding: 9px 12px; border-radius: 8px; font-size: 13px; line-height: 20px; font-weight: 500; transition: background-color .15s; }
.primary { width: 100%; border: 0; background: var(--phone-primary); color: var(--phone-primary-text); }
.primary:hover:not(:disabled) { filter: brightness(.94); }
.error, .success { padding: 10px 12px; border-radius: 8px; }
.error { background: var(--phone-error-bg); color: var(--phone-error); }
.error button { min-height: 28px; padding: 2px 6px; text-decoration: underline; color: inherit; }
.success { background: var(--phone-accent-bg); color: var(--phone-accent); }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--phone-accent); outline-offset: 3px; }
:deep(.sms-fields) { min-width: 0; gap: 12px; }
:deep(.sms-fields label) { min-width: 0; font-size: 12px; line-height: 18px; color: var(--phone-muted); }
:deep(.sms-fields input), :deep(.sms-fields select) { min-height: 42px; padding: 10px 12px; border-color: var(--phone-border); background: var(--phone-input); color: var(--phone-text); font-size: 13px; line-height: 20px; }
:deep(.sms-fields input::placeholder) { color: var(--phone-muted); opacity: 1; }
:deep(.sms-fields select option) { background: var(--phone-input); color: var(--phone-text); }
:deep(.sms-code-row) { flex-wrap: wrap; }
:deep(.sms-code-row input) { flex: 1 1 160px; width: auto; }
:deep(.sms-code-row button) { flex: 1 1 112px; min-height: 40px; padding: 9px 12px; border-color: var(--phone-border); background: var(--phone-accent-bg); color: var(--phone-accent); font-size: 12px; line-height: 20px; white-space: normal; overflow-wrap: anywhere; }
:deep(.sms-code-row button:hover:not(:disabled)) { background: var(--phone-surface); }
:deep(.sms-fields input:focus-visible), :deep(.sms-fields select:focus-visible), :deep(.sms-fields button:focus-visible) { outline-color: var(--phone-accent); }
:deep(.sms-bound) { padding: 10px 12px; border: 1px solid var(--phone-border); border-radius: 8px; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--phone-text); }
:deep(.sms-error) { color: var(--phone-error); }
:deep(.sms-fields p[role="status"]) { color: var(--phone-accent); }
:root.canvas-theme-light .phone-binding {
  --phone-surface: #fafaf9;
  --phone-border: rgba(0, 0, 0, .12);
  --phone-text: #292524;
  --phone-muted: #57534e;
  --phone-input: #ffffff;
  --phone-accent: #047857;
  --phone-accent-bg: rgba(16, 185, 129, .08);
  --phone-primary: #047857;
  --phone-primary-text: #ffffff;
  --phone-error: #b91c1c;
  --phone-error-bg: rgba(239, 68, 68, .06);
}
:root.canvas-theme-light .phone-binding :deep(.sms-fields input::placeholder) { color: var(--phone-muted) !important; }
</style>

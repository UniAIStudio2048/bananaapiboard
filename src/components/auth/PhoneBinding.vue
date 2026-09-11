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
    <h4>{{ copy.phone }}</h4>
    <p v-if="info">{{ info.phone_bound?copy.bound:copy.unbound }}</p>
    <p v-if="error" role="alert" class="error">{{ error }} <button type="button" @click="load">{{ copy.retry }}</button></p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="info?.phone_bound">{{ copy.unbindHint }}</p>
    <template v-if="info && available">
      <PhoneVerificationFields :key="purpose" v-model="verification" :purpose="purpose" :countries="countries" :bound-phone="info.phone_bound?info.phone_masked:''" :busy="busy" authenticated />
      <button type="button" class="primary" :disabled="busy" @click="submit">{{ busy?copy.submitting:purpose==='bind'?copy.bind:copy.unbind }}</button>
    </template>
    <p v-else-if="info">{{ info.phone_bound && !info.can_unbind?copy.passwordRequired:copy.unavailable }} {{ info.phone_masked }}</p>
  </section>
</template>
<style scoped>
.phone-binding{display:grid;gap:12px;margin:20px 0;padding:16px 0;border-block:1px solid #64748b50;color:inherit}h4,p{margin:0}p{font-size:13px}button{padding:8px 12px;border-radius:8px}.primary{background:#2563eb;color:white}.error{color:#ef4444}button:disabled{opacity:.5}
</style>

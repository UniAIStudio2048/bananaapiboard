<script setup>
import { computed, ref, watch } from 'vue'
import PhoneVerificationFields from './PhoneVerificationFields.vue'
import { smsRequest, completeSmsAuthentication } from '@/api/sms'
import { useSmsCopy } from '@/composables/useSmsAuth'
import { smsErrorText } from '@/utils/smsCopy'
const props=defineProps({mode:{type:String,required:true},policy:{type:Object,required:true},inviteCode:{type:String,default:''},requireInviteCode:Boolean})
const emit=defineEmits(['authenticated','back','retrieve'])
const copy=useSmsCopy()
const verification=ref({phone:'',country:'CN',code:'',request_id:''})
const username=ref(''),password=ref(''),confirm=ref(''),invite=ref(props.inviteCode),busy=ref(false),error=ref(''),done=ref(false)
const countries=computed(()=>props.policy.sms?.[props.mode]||[])
watch(()=>props.mode,()=>{verification.value={phone:'',country:'CN',code:'',request_id:''};password.value='';confirm.value='';error.value='';done.value=false})
watch(()=>props.inviteCode,value=>invite.value=value)
async function submit(){
  if(busy.value)return
  error.value=''
  if(!verification.value.request_id||!/^\d{6}$/.test(verification.value.code)){error.value=copy.value.requiredCode;return}
  if(props.mode!=='login'&&(password.value.length<6||password.value!==confirm.value)){error.value=password.value.length<6?copy.value.weak:copy.value.mismatch;return}
  busy.value=true
  try{
    const body={...verification.value}
    const path=props.mode==='register'?'/api/auth/register':props.mode==='retrieve'?'/api/auth/sms-retrieve':'/api/auth/sms-login'
    if(props.mode==='register')Object.assign(body,{username:username.value,password:password.value,invite_code:invite.value})
    if(props.mode==='retrieve')body.new_password=password.value
    const result=await smsRequest(path,body)
    if(props.mode==='retrieve'){done.value=true;password.value='';confirm.value=''}
    else{completeSmsAuthentication(result);emit('authenticated',result)}
  }catch(e){error.value=smsErrorText(e,copy.value)}finally{busy.value=false}
}
</script>
<template>
  <form class="phone-auth" @submit.prevent="submit" data-testid="phone-auth-form">
    <p v-if="done" role="status">{{ copy.resetDone }}</p>
    <template v-else-if="countries.length">
      <label v-if="mode==='register'">{{ copy.username }}<input v-model="username" autocomplete="username" maxlength="64" required :disabled="busy" /></label>
      <PhoneVerificationFields v-model="verification" :purpose="mode" :countries="countries" :busy="busy" />
      <template v-if="mode!=='login'"><label>{{ mode==='retrieve'?copy.newPassword:copy.password }}<input v-model="password" type="password" autocomplete="new-password" minlength="6" maxlength="256" required :disabled="busy" /></label><label>{{ copy.confirm }}<input v-model="confirm" type="password" autocomplete="new-password" required :disabled="busy" /></label></template>
      <label v-if="mode==='register'">{{ copy.invite }}{{ requireInviteCode?' *':'' }}<input v-model="invite" maxlength="12" :required="requireInviteCode" :disabled="busy" /></label>
      <p v-if="error" role="alert" class="sms-error">{{ error }}</p>
      <button type="submit" class="primary" :disabled="busy">{{ busy?copy.submitting:mode==='register'?copy.register:mode==='retrieve'?copy.reset:copy.login }}</button>
    </template>
    <p v-else role="status">{{ copy.unavailable }}</p>
    <button v-if="mode==='login' && policy.sms?.retrieve?.length" type="button" @click="emit('retrieve')">{{ copy.retrieve }}</button>
    <button type="button" @click="emit('back')">{{ copy.back }}</button>
  </form>
</template>
<style scoped>
.phone-auth{display:grid;gap:14px;color:inherit}label{display:grid;gap:6px;font-size:14px}input{box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid #64748b80;border-radius:8px;background:var(--sms-input-bg,#ffffff10);color:inherit}button{padding:10px;border-radius:8px;color:inherit}button.primary{background:#2563eb;color:white;font-weight:600}button:disabled{opacity:.5;cursor:not-allowed}input:focus-visible,button:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}.sms-error{color:#ef4444}p{margin:0;font-size:14px}
</style>

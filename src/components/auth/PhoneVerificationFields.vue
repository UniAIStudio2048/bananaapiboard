<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { getCountryCallingCode } from 'libphonenumber-js/min'
import { smsRequest } from '@/api/sms'
import { useSmsCopy } from '@/composables/useSmsAuth'
import { smsErrorText } from '@/utils/smsCopy'
const props = defineProps({ modelValue:{type:Object,required:true}, purpose:{type:String,required:true}, countries:{type:Array,default:()=>[]}, authenticated:Boolean, boundPhone:{type:String,default:''}, busy:Boolean })
const emit = defineEmits(['update:modelValue'])
const copy = useSmsCopy()
const sending = ref(false)
const error = ref('')
const sent = ref(false)
const remaining = ref(0)
let until = 0, timer
const countryOptions = computed(() => props.countries.map(country => ({country,code:getCountryCallingCode(country)})))
function update(patch) { emit('update:modelValue',{...props.modelValue,...patch}) }
function invalidate() { update({request_id:'',code:''}); sent.value=false; error.value='' }
watch([() => props.modelValue.phone, () => props.modelValue.country, () => props.purpose], invalidate)
watch(() => props.countries, list => { if (list.length && !list.includes(props.modelValue.country)) update({country:list[0]}) },{immediate:true})
function startCountdown(seconds) {
  until=Date.now()+seconds*1000
  clearInterval(timer)
  const tick=()=>{remaining.value=Math.max(0,Math.ceil((until-Date.now())/1000));if(!remaining.value)clearInterval(timer)}
  tick();timer=setInterval(tick,500)
}
async function send() {
  if(sending.value||remaining.value||props.busy)return
  sending.value=true;error.value=''
  const snapshot={phone:props.modelValue.phone,country:props.modelValue.country,purpose:props.purpose}
  try {
    const result=await smsRequest('/api/sms/send-code',snapshot,props.authenticated)
    if(snapshot.phone!==props.modelValue.phone||snapshot.country!==props.modelValue.country||snapshot.purpose!==props.purpose)return
    update({request_id:result.request_id,code:''});sent.value=true;startCountdown(result.retry_after||60)
  } catch(e) { error.value=smsErrorText(e,copy.value);if(e.retryAfter)startCountdown(e.retryAfter) }
  finally { sending.value=false }
}
onUnmounted(()=>clearInterval(timer))
</script>
<template>
  <div class="sms-fields">
    <p v-if="boundPhone" class="sms-bound">{{ boundPhone }}</p>
    <template v-else>
      <label>{{ copy.country }}<select :value="modelValue.country" :disabled="sending || busy" @change="update({country:$event.target.value})"><option v-for="item in countryOptions" :key="item.country" :value="item.country">{{ item.country }} +{{ item.code }}</option></select></label>
      <label>{{ copy.phone }}<input :value="modelValue.phone" type="tel" autocomplete="tel" :disabled="sending || busy" required maxlength="64" @input="update({phone:$event.target.value})" /></label>
    </template>
    <label>{{ copy.code }}<div class="sms-code-row"><input :aria-label="copy.code" :value="modelValue.code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" :disabled="busy" required @input="update({code:$event.target.value.replace(/\D/g,'')})" /><button type="button" :disabled="sending || busy || remaining > 0 || !countries.length || (!boundPhone && !modelValue.phone)" @click="send">{{ sending ? copy.sending : remaining ? `${remaining}s` : copy.send }}</button></div></label>
    <p v-if="error" role="alert" class="sms-error">{{ error }}</p><p v-else-if="sent" role="status">{{ copy.sent }}</p>
  </div>
</template>
<style scoped>
.sms-fields{display:grid;gap:12px}label{display:grid;gap:6px;font-size:14px}input,select{box-sizing:border-box;min-width:0;width:100%;border:1px solid #64748b80;border-radius:8px;padding:10px 12px;background:var(--sms-input-bg,#ffffff10);color:inherit}select option{color:#111827;background:white}.sms-code-row{display:flex;gap:8px}.sms-code-row input{flex:1;width:40%}button{border:1px solid #64748b80;border-radius:8px;padding:8px 10px;color:inherit;white-space:nowrap}button:disabled{opacity:.45;cursor:not-allowed}input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}.sms-error{color:#ef4444}p{font-size:13px;margin:0}.sms-bound{font-size:16px}
</style>

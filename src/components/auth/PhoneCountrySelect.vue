<script setup>
import { computed } from 'vue'
import { getCountryCallingCode } from 'libphonenumber-js/min'
import { useSmsCopy } from '@/composables/useSmsAuth'
const props = defineProps({ modelValue: { type: String, default: 'CN' }, countries: { type: Array, default: () => [] }, account: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
const copy = useSmsCopy()
const options = computed(() => props.countries.map(country => ({ country, code: getCountryCallingCode(country) })))
</script>
<template>
  <label v-if="countries.some(country => country !== 'CN') && /^\+?[\d\s()-]+$/.test(account)" class="phone-country">
    {{ copy.country }}
    <select :value="modelValue" @change="emit('update:modelValue', $event.target.value)">
      <option v-for="item in options" :key="item.country" :value="item.country">{{ item.country }} +{{ item.code }}</option>
    </select>
  </label>
</template>
<style scoped>
.phone-country{display:grid;gap:6px;font-size:14px;color:inherit}select{box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid #64748b80;border-radius:8px;background:var(--sms-input-bg,#ffffff10);color:inherit}option{color:#111827;background:white}select:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
</style>

<script setup>
import { t as translateUi } from '@/i18n'

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { checkoutApi } from '@/api/checkout'
import { openCheckout } from '@/utils/openCheckout'
import { useCurrencyDisplay } from '@/utils/currencyDisplay'
const labels = { get pending() { return translateUi('uiMessages.m25f4ba580022') }, get awaiting_receipt() { return translateUi('uiMessages.m030a69e17967') }, get pending_review() { return translateUi('uiMessages.m7bf25421c6df') }, get rejected() { return translateUi('uiMessages.m4dbcdec8693b') }, get paid() { return translateUi('uiMessages.m0a52f8af1bda') } }
const orders = ref([]), loading = ref(false), error = ref('')
const { formatMoney } = useCurrencyDisplay()
let disposed = false
async function load() {
  loading.value = true
  try { const result = await checkoutApi.list(); if (!disposed) { orders.value = result; error.value = '' } }
  catch (e) { if (!disposed) error.value = e.message } finally { loading.value = false }
}
async function resume(order) { await openCheckout({ kind: order.kind }, order.title, order.id); await load() }
onMounted(() => { load(); window.addEventListener('checkout-paid', load) })
onBeforeUnmount(() => { disposed = true; window.removeEventListener('checkout-paid', load) })
</script>
<template>
  <section class="checkout-orders">
    <div class="checkout-orders-heading"><h3>{{ translateUi('uiMessages.m335bcbabcf7e') }}</h3><button :disabled="loading" @click="load">{{ loading ? translateUi('uiMessages.m7f3c8312816f') : translateUi('common.refresh') }}</button></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!orders.length" class="checkout-orders-muted">{{ translateUi('uiMessages.m463b5c58999e') }}</p>
    <div v-for="order in orders" :key="order.id" class="checkout-orders-row"><div><strong>{{ order.title }}</strong><small>{{ order.id }}</small></div><span>{{ formatMoney(order.total_fen) }}</span><button v-if="order.status !== 'paid'" @click="resume(order)">{{ translateUi('uiMessages.m56d0e1adc9cc', { value1: (labels[order.display_status] || translateUi('uiMessages.m25f4ba580022')) }) }}</button><span v-else class="checkout-orders-muted">{{ translateUi('uiMessages.m0a52f8af1bda') }}</span></div>
  </section>
</template>
<style scoped>
.checkout-orders{padding:20px;margin-bottom:20px;border:1px solid var(--border-color,#8883);border-radius:12px;color:inherit}.checkout-orders-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}.checkout-orders-heading h3{font-size:16px;font-weight:600}.checkout-orders button{font-size:13px;padding:6px 9px;border:1px solid #8884;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.checkout-orders-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid #8882;font-size:13px}.checkout-orders-row strong{font-weight:500}.checkout-orders-row small{display:block;font-size:10px;opacity:.5;margin-top:5px;overflow-wrap:anywhere}.checkout-orders-muted{opacity:.6;font-size:13px;margin:12px 0}@media(max-width:600px){.checkout-orders-row{flex-wrap:wrap}.checkout-orders-row>div{width:100%}}
</style>

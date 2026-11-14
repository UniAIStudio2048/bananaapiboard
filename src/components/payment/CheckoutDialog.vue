<script setup>
import { t as translateUi } from '@/i18n'

import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import QRCode from 'qrcode'
import { checkoutApi } from '@/api/checkout'
import { createCheckoutController } from '@/utils/checkoutController'
import { checkoutRequest, closeCheckout } from '@/utils/openCheckout'
import { useCurrencyDisplay } from '@/utils/currencyDisplay'

const { formatMoney } = useCurrencyDisplay()
const state = shallowRef({ open: false, methods: [], busy: false })
const image = ref(''), now = ref(Date.now()), payer = ref(''), phone = ref(''), receipt = ref(null), submitting = ref(false), receiptError = ref('')
const svg = ref(''), qrError = ref('')
const card = ref(null), history = ref([]), showHistory = ref(false), historyError = ref('')
const canvasMode = ref(false)
let clock, lastFocus, imageVersion = 0, submissionAbort
const controller = createCheckoutController({ api: checkoutApi, onChange: value => { state.value = value }, onPaid: order => {
  window.dispatchEvent(new CustomEvent('user-info-updated'))
  window.dispatchEvent(new CustomEvent('checkout-paid', { detail: order }))
  closeCheckout(order)
} })
const attempt = computed(() => state.value.attempt)
const isBank = computed(() => attempt.value?.module === 'BankTransfer')
const expired = computed(() => !isBank.value && attempt.value && Number(attempt.value.expires_at) <= now.value)
const remaining = computed(() => {
  const seconds = Math.max(0, Math.ceil((Number(attempt.value?.expires_at || 0) - now.value) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})
const locked = computed(() => attempt.value?.status === 'pending_review')
const amount = computed(() => attempt.value?.amount_fen ?? state.value.order?.total_fen ?? checkoutRequest.value?.input.amount)
const title = computed(() => state.value.order?.snapshot?.title || checkoutRequest.value?.title || translateUi('uiMessages.m34c2f202026e'))
const submission = computed(() => state.value.order?.submissions?.find(s => s.attempt_id === attempt.value?.id))
const bankFields = [['account_name', translateUi('uiMessages.m22320ca0675e')], ['account_number', translateUi('uiMessages.m0cc3f24453f3')], ['bank_name', translateUi('uiMessages.mc74687bbb415')], ['tax_number', translateUi('uiMessages.m67188379f8ea')], ['address', translateUi('uiMessages.m37aac5b4e639')], ['phone', translateUi('uiMessages.md6981829142a')], ['bank_code', translateUi('uiMessages.m3dc20aa37c90')], ['instructions', translateUi('uiMessages.m7c93f1355bf6')]]
const labels = { get pending() { return translateUi('uiMessages.m25f4ba580022') }, get awaiting_receipt() { return translateUi('uiMessages.m030a69e17967') }, get paid() { return translateUi('uiMessages.m0a52f8af1bda') }, get pending_review() { return translateUi('uiMessages.m7bf25421c6df') }, get approved() { return translateUi('uiMessages.m70328c527b65') }, get rejected() { return translateUi('uiMessages.m4dbcdec8693b') } }

function dismiss() { controller.close(); closeCheckout() }
function trapKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); dismiss() }
  if (event.key !== 'Tab') return
  const items = [...(card.value?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') || [])]
  if (!items.length) return
  const first = items[0], last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
async function loadHistory() {
  showHistory.value = !showHistory.value
  if (!showHistory.value) return
  try { history.value = await checkoutApi.list(); historyError.value = '' }
  catch (e) { historyError.value = e.message }
}
async function resume(order) {
  showHistory.value = false
  await controller.open({ kind: order.kind }, order.id)
}
async function copyBank() {
  try { await navigator.clipboard.writeText(bankFields.filter(([key]) => attempt.value?.bank_snapshot?.[key]).map(([key, label]) => `${label}：${attempt.value.bank_snapshot[key]}`).join('\n')); receiptError.value = translateUi('uiMessages.m041d42f6bf20') }
  catch { receiptError.value = translateUi('uiMessages.m34de68853c1f') }
}
async function submit() {
  if (submitting.value || !attempt.value) return
  receiptError.value = ''
  if (!payer.value.trim() || !phone.value.trim() || !receipt.value) { receiptError.value = translateUi('uiMessages.m9b53829a2dc7'); return }
  if (receipt.value.size > 10 * 1024 * 1024) { receiptError.value = translateUi('uiMessages.mf159a80341ec'); return }
  submitting.value = true; submissionAbort = new AbortController()
  const body = new FormData(); body.append('payer', payer.value.trim()); body.append('phone', phone.value.trim()); body.append('receipt', receipt.value)
  try {
    await checkoutApi.submit(attempt.value.id, body, submissionAbort.signal)
    await controller.poll()
  } catch (e) { if (!submissionAbort.signal.aborted) receiptError.value = e.message }
  finally { submitting.value = false }
}
watch(checkoutRequest, async request => {
  if (!request) {
    controller.close(); clearInterval(clock); submissionAbort?.abort(); lastFocus?.focus?.(); return
  }
  lastFocus = document.activeElement
  canvasMode.value = /^\/canvas(?:\/|$)/.test(window.location.pathname)
  payer.value = ''; phone.value = ''; receipt.value = null; receiptError.value = ''; showHistory.value = false
  clearInterval(clock); clock = setInterval(() => { now.value = Date.now() }, 1000)
  await controller.open(request.input, request.existingId)
  await nextTick(); card.value?.focus()
}, { immediate: true })
async function renderQr() {
  const value = attempt.value?.qr_code || attempt.value?.pay_url
  const version = ++imageVersion; image.value = ''; svg.value = ''; qrError.value = ''
  if (!value) return
  try {
    if (/^data:image\/(png|jpeg|webp);base64,/i.test(value)) { image.value = value; return }
    // Only insert geometry generated locally by qrcode, never HTML supplied by the gateway.
    const result = await QRCode.toString(value, { type: 'svg', width: 256, margin: 4, errorCorrectionLevel: 'M' })
    if (version === imageVersion) svg.value = result
  } catch { if (version === imageVersion) qrError.value = translateUi('uiMessages.m0fa9691a8ed3') }
}
watch([() => attempt.value?.id, () => attempt.value?.qr_code || attempt.value?.pay_url], renderQr)
onBeforeUnmount(() => { controller.close(); clearInterval(clock); submissionAbort?.abort(); closeCheckout() })
</script>

<template>
  <Teleport to="body">
    <div v-if="checkoutRequest" class="checkout-overlay" :class="{ 'checkout-canvas': canvasMode }" @click.self="dismiss" @keydown="trapKey">
      <section ref="card" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabindex="-1" class="checkout-card">
        <header class="checkout-header"><div><h2 id="checkout-title">{{ title }}</h2><p>{{ isBank ? translateUi('uiMessages.meb076395c018') : translateUi('uiMessages.m03fd75724446') }}</p></div><button class="checkout-close" :aria-label="translateUi('uiMessages.m8e7ad9aaae6f')" @click="dismiss">×</button></header>
        <div class="checkout-content">
          <div class="checkout-methods" role="group" :aria-label="translateUi('user.paymentMethod')">
            <button v-for="method in state.methods" :key="method.id" :disabled="state.busy || locked || submitting" :aria-pressed="state.selected === method.id" :class="{ selected: state.selected === method.id }" @click="controller.choose(method.id)">
              <img v-if="method.icon_url" :src="method.icon_url" alt="" />{{ method.name }}<span v-if="state.selected === method.id" aria-hidden="true"> ✓</span>
            </button>
          </div>
          <p v-if="!state.busy && !state.methods.length && !attempt" class="checkout-hint">{{ translateUi('uiMessages.mbd4bbcb8d5ab') }}</p>
          <p v-if="state.error" role="alert" class="checkout-error">{{ state.error }}</p>
          <div v-if="state.busy" class="checkout-loading" role="status">{{ translateUi('uiMessages.m89f69d79d640') }}</div>
          <template v-else-if="isBank">
            <div class="checkout-bank-summary"><strong>{{ formatMoney(amount) }}</strong><span>{{ state.order?.id }}</span><p v-if="state.order?.kind === 'package'">{{ translateUi('uiMessages.m87b80dc1bc85') }}</p></div>
            <div class="checkout-bank-grid">
              <div><h3>{{ translateUi('uiMessages.m79bf11a5532f') }}</h3><dl><template v-for="[key, label] in bankFields" :key="key"><template v-if="attempt.bank_snapshot?.[key]"><dt>{{ label }}</dt><dd>{{ attempt.bank_snapshot[key] }}</dd></template></template></dl><button class="checkout-secondary" @click="copyBank">{{ translateUi('uiMessages.m7944fab368b3') }}</button></div>
              <div v-if="locked"><h3>{{ translateUi('uiMessages.mdf5224bb6342') }}</h3><p class="checkout-hint">{{ translateUi('uiMessages.m3cb50aa813d2') }}</p></div>
              <form v-else @submit.prevent="submit"><h3>{{ translateUi('uiMessages.mf7bd43edec10') }}</h3><p v-if="submission?.status === 'rejected'" class="checkout-error">{{ translateUi('uiMessages.m6453bab687cd', { value1: (submission.note) }) }}</p><label>{{ translateUi('uiMessages.m2869cdcdc39a') }}<input v-model="payer" maxlength="255" required autocomplete="name" /></label><label>{{ translateUi('uiMessages.md6981829142a') }}<input v-model="phone" type="tel" maxlength="40" required autocomplete="tel" /></label><label>{{ translateUi('uiMessages.m934a02cb7fdb') }}<input type="file" accept="image/jpeg,image/png,application/pdf" required @change="receipt = $event.target.files[0]" /></label><p class="checkout-hint">{{ translateUi('uiMessages.m259ca54966b2') }}</p><button class="checkout-primary" :disabled="submitting">{{ submitting ? translateUi('uiMessages.m26ef00b7d061') : translateUi('uiMessages.m034829aca81d') }}</button></form>
            </div>
          </template>
          <div v-else-if="attempt" class="checkout-pay-grid">
            <div class="checkout-qr"><div v-if="svg" class="checkout-qr-svg" role="img" :aria-label="translateUi('uiMessages.m9739c55bbbf4')" v-html="svg"></div><img v-else-if="image && !qrError" :key="image" :src="image" :alt="translateUi('uiMessages.m9739c55bbbf4')" @error="qrError = '二维码显示失败，请重试'" /><div v-else class="checkout-qr-placeholder"><template v-if="qrError"><span role="alert">{{ qrError }}</span><button class="checkout-qr-retry" @click="renderQr">{{ translateUi('uiMessages.me4af0166c5d4') }}</button></template><template v-else>{{ attempt.status === 'creating' ? translateUi('uiMessages.m979e82841492') : (attempt.qr_code || attempt.pay_url ? translateUi('uiMessages.mef27938ce7e1') : translateUi('uiMessages.me642a8cb0817')) }}</template></div><div v-if="expired || attempt.status === 'creating' || (!attempt.qr_code && !attempt.pay_url)" class="checkout-qr-cover"><strong>{{ expired ? translateUi('uiMessages.mdbcac8ae7d65') : translateUi('uiMessages.m8c32d7388042') }}</strong><button @click="controller.refresh">{{ expired ? translateUi('uiMessages.m19532876db9e') : translateUi('uiMessages.m42d47a69b5f2') }}</button></div></div>
            <div class="checkout-payment-info"><div class="checkout-amount">{{ formatMoney(amount) }}</div><p v-if="attempt.balance_fen > 0" class="checkout-hint">{{ translateUi('uiMessages.me643dcd8eb21', { value1: (formatMoney(attempt.balance_fen)) }) }}</p><p v-if="state.order?.balance_fen !== undefined && attempt.balance_fen > state.order.balance_fen" class="checkout-error">{{ translateUi('uiMessages.mc47d312556a8', { value1: (formatMoney(attempt.balance_fen - state.order.balance_fen)) }) }}</p><p>{{ attempt.qr_code ? translateUi('uiMessages.md362ce60f94f') : translateUi('uiMessages.meb754e9770f5') }}</p><p v-if="!expired" class="checkout-hint">{{ translateUi('uiMessages.m7ea0bcb55958', { value1: (remaining) }) }}</p><a v-if="attempt.pay_url && !expired" class="checkout-mobile-link" :href="attempt.pay_url" target="_blank" rel="noopener noreferrer">{{ translateUi('uiMessages.m304e20af30ca') }}</a><p class="checkout-hint">{{ translateUi('uiMessages.m85533079475b') }}</p></div>
          </div>
          <p v-else-if="state.methods.length" class="checkout-empty">{{ translateUi('uiMessages.m87e96b1a3f3f') }}</p>
          <p v-if="receiptError" role="status" class="checkout-hint">{{ receiptError }}</p>
          <footer class="checkout-footer"><button class="checkout-text" @click="loadHistory">{{ showHistory ? translateUi('uiMessages.m560325f6041c') : translateUi('uiMessages.m4cc7dbaaa068') }}</button><span v-if="state.order">{{ translateUi('uiMessages.m91322e4a3dd3', { value1: (state.order.id) }) }}</span></footer>
          <div v-if="showHistory" class="checkout-history"><p v-if="historyError" role="alert">{{ historyError }}</p><p v-else-if="!history.length">{{ translateUi('uiMessages.m2755c543af34') }}</p><button v-for="order in history" :key="order.id" :disabled="order.status === 'paid'" @click="resume(order)"><span>{{ order.title }} · {{ formatMoney(order.total_fen) }}</span><span>{{ labels[order.display_status || order.status] || order.status }}{{ order.status !== 'paid' ? translateUi('uiMessages.m40dadcadbcc7') : '' }}</span></button></div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.checkout-overlay{--text-primary:#f5f5f5;--bg-primary:#111;--bg-secondary:#181818;--bg-tertiary:#242424;--bg-hover:#ffffff16;--border-color:#ffffff24;position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);color:var(--text-primary,#f5f5f5)}
.checkout-card{width:min(760px,100%);max-height:90vh;max-height:90dvh;overflow:auto;background:var(--bg-secondary,#181818);border:1px solid var(--border-color,rgba(255,255,255,.12));border-radius:20px;box-shadow:0 20px 70px #0006;outline:none}
.checkout-header{display:flex;justify-content:space-between;align-items:flex-start;padding:26px 28px 20px;border-bottom:1px solid var(--border-color,#ffffff14)}
.checkout-header h2{font-size:23px;font-weight:650;margin:0}.checkout-header p{margin:7px 0 0;font-size:13px;opacity:.6}.checkout-close{background:none;border:0;font-size:28px;line-height:1;color:inherit;opacity:.65;cursor:pointer;padding:0 4px}
.checkout-content{padding:24px 28px}.checkout-methods{display:flex;gap:10px;flex-wrap:wrap}.checkout-methods button,.checkout-secondary{padding:10px 15px;border:1px solid var(--border-color,#ffffff24);border-radius:9px;background:var(--bg-tertiary,#242424);color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-size:14px}.checkout-methods button.selected{border-color:currentColor;background:var(--bg-hover,#ffffff16)}.checkout-methods img{width:20px;height:20px;object-fit:contain}
button:disabled{opacity:.45;cursor:default}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid currentColor;outline-offset:3px}.checkout-loading,.checkout-empty{padding:42px 0;text-align:center;opacity:.6}.checkout-error{color:#ef6464;font-size:14px;margin:14px 0}.checkout-hint{opacity:.65;font-size:13px;line-height:1.7;margin:12px 0}
.checkout-pay-grid{display:grid;grid-template-columns:240px 1fr;gap:28px;align-items:center;padding:26px 0}.checkout-qr{position:relative;width:240px;height:240px;background:white;border-radius:12px;overflow:hidden}.checkout-qr-svg,.checkout-qr-svg :deep(svg){width:100%;height:100%;display:block}.checkout-qr img{width:100%;height:100%;display:block}.checkout-qr-placeholder{display:flex;flex-direction:column;gap:16px;padding:16px;box-sizing:border-box;text-align:center;align-items:center;justify-content:center;height:100%;color:#333;font-size:14px}.checkout-qr-cover{position:absolute;inset:0;background:#191b20ed;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;color:#fff}.checkout-qr-cover button{border:0;background:none;color:#6aaaff;cursor:pointer;font-size:15px}.checkout-amount{font-size:36px;font-weight:650;margin-bottom:18px}.checkout-payment-info>p{font-size:14px;line-height:1.7}.checkout-mobile-link{display:inline-block;color:inherit;text-decoration:underline;padding:8px}.checkout-qr-retry{border:0;background:none;color:#2563eb;cursor:pointer;text-decoration:underline}
.checkout-bank-summary{margin:24px 0}.checkout-bank-summary strong{font-size:28px}.checkout-bank-summary span{display:block;font-size:12px;opacity:.5;margin:8px 0;overflow-wrap:anywhere}.checkout-bank-summary p{font-size:13px;opacity:.7}.checkout-bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.checkout-bank-grid h3{font-size:16px;font-weight:600;margin-bottom:18px}dl{font-size:13px;line-height:1.7}dt{opacity:.6;margin-top:10px}dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}.checkout-secondary{margin-top:20px}.checkout-bank-grid label{display:block;font-size:13px;margin:14px 0}.checkout-bank-grid input{display:block;box-sizing:border-box;width:100%;margin-top:8px;padding:10px;border:1px solid var(--border-color,#ffffff24);border-radius:8px;background:var(--bg-primary,#111);color:inherit}.checkout-primary{background:var(--text-primary,#f5f5f5);color:var(--bg-primary,#111);border:0;border-radius:9px;padding:11px 20px;font-weight:600;cursor:pointer}
.checkout-footer{border-top:1px solid var(--border-color,#ffffff14);padding-top:18px;margin-top:20px;display:flex;flex-direction:column;gap:12px;align-items:flex-start}.checkout-text{background:none;border:0;color:inherit;opacity:.65;font-size:12px;cursor:pointer;padding:0}.checkout-footer span{font-size:11px;opacity:.4;overflow-wrap:anywhere}.checkout-history{margin-top:12px}.checkout-history button{display:flex;justify-content:space-between;gap:12px;background:transparent;border:0;border-bottom:1px solid var(--border-color,#ffffff14);padding:14px 0;color:inherit;width:100%;text-align:left;cursor:pointer;font-size:13px}
:global(html:not(.dark) .checkout-overlay:not(.checkout-canvas)),:global(html.canvas-theme-light .checkout-overlay.checkout-canvas){--text-primary:#171717;--bg-primary:#fff;--bg-secondary:#fafafa;--bg-tertiary:#f0f0f0;--bg-hover:#e8e8e8;--border-color:#ddd}
@media(max-width:600px){.checkout-overlay{padding:12px}.checkout-card{border-radius:16px;max-height:94vh;max-height:94dvh}.checkout-header{padding:20px}.checkout-content{padding:20px}.checkout-pay-grid{grid-template-columns:1fr;gap:18px}.checkout-qr{margin:auto}.checkout-payment-info{text-align:center}.checkout-amount{font-size:30px;margin-bottom:10px}.checkout-bank-grid{grid-template-columns:1fr}.checkout-mobile-link{display:inline-block;color:inherit;text-decoration:underline;padding:8px}.checkout-methods button{flex:1 1 130px;justify-content:center}.checkout-history button{flex-direction:column;gap:4px}}
</style>

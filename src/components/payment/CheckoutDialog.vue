<script setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import QRCode from 'qrcode'
import { checkoutApi } from '@/api/checkout'
import { createCheckoutController } from '@/utils/checkoutController'
import { checkoutRequest, closeCheckout } from '@/utils/openCheckout'
import { useCurrencyDisplay } from '@/utils/currencyDisplay'

const { formatMoney } = useCurrencyDisplay()
const state = shallowRef({ open: false, methods: [], busy: false })
const image = ref(''), now = ref(Date.now()), payer = ref(''), phone = ref(''), receipt = ref(null), submitting = ref(false), receiptError = ref('')
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
const title = computed(() => state.value.order?.snapshot?.title || checkoutRequest.value?.title || '订单支付')
const submission = computed(() => state.value.order?.submissions?.find(s => s.attempt_id === attempt.value?.id))
const bankFields = [['account_name', '收款户名'], ['account_number', '银行账号'], ['bank_name', '开户行'], ['tax_number', '税号'], ['address', '地址'], ['phone', '联系电话'], ['bank_code', '联行号'], ['instructions', '转账说明']]
const labels = { pending: '待支付', awaiting_receipt: '待提交回执', paid: '已支付', pending_review: '待审核', approved: '审核通过', rejected: '已驳回' }

function dismiss() { controller.close(); closeCheckout() }
function trapKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); dismiss() }
  if (event.key !== 'Tab') return
  const items = [...(card.value?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') || [])]
  if (!items.length) return
  const first = items[0], last = items.at(-1)
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
  try { await navigator.clipboard.writeText(bankFields.filter(([key]) => attempt.value?.bank_snapshot?.[key]).map(([key, label]) => `${label}：${attempt.value.bank_snapshot[key]}`).join('\n')); receiptError.value = '收款信息已复制' }
  catch { receiptError.value = '复制失败，请选择收款信息手动复制' }
}
async function submit() {
  if (submitting.value || !attempt.value) return
  receiptError.value = ''
  if (!payer.value.trim() || !phone.value.trim() || !receipt.value) { receiptError.value = '请填写付款人、联系电话并上传回执'; return }
  if (receipt.value.size > 10 * 1024 * 1024) { receiptError.value = '回执不能超过 10 MB'; return }
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
watch(() => attempt.value?.qr_code || attempt.value?.pay_url, async value => {
  const version = ++imageVersion; image.value = ''
  if (!value) return
  try {
    const result = /^data:image\/(png|jpeg|webp);base64,/.test(value) ? value : await QRCode.toDataURL(value, { width: 256, margin: 2, errorCorrectionLevel: 'M' })
    if (version === imageVersion) image.value = result
  } catch { if (version === imageVersion) receiptError.value = '二维码生成失败，请刷新重试' }
})
onBeforeUnmount(() => { controller.close(); clearInterval(clock); submissionAbort?.abort(); closeCheckout() })
</script>

<template>
  <Teleport to="body">
    <div v-if="checkoutRequest" class="checkout-overlay" :class="{ 'checkout-canvas': canvasMode }" @click.self="dismiss" @keydown="trapKey">
      <section ref="card" role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabindex="-1" class="checkout-card">
        <header class="checkout-header"><div><h2 id="checkout-title">{{ title }}</h2><p>{{ isBank ? '审核通过后到账／开通' : '请选择支付方式完成购买' }}</p></div><button class="checkout-close" aria-label="关闭支付窗口" @click="dismiss">×</button></header>
        <div class="checkout-content">
          <div class="checkout-methods" role="group" aria-label="支付方式">
            <button v-for="method in state.methods" :key="method.id" :disabled="state.busy || locked || submitting" :aria-pressed="state.selected === method.id" :class="{ selected: state.selected === method.id }" @click="controller.choose(method.id)">
              <img v-if="method.icon_url" :src="method.icon_url" alt="" />{{ method.name }}<span v-if="state.selected === method.id" aria-hidden="true"> ✓</span>
            </button>
          </div>
          <p v-if="!state.busy && !state.methods.length && !attempt" class="checkout-hint">暂无可用支付方式，请联系管理员。</p>
          <p v-if="state.error" role="alert" class="checkout-error">{{ state.error }}</p>
          <div v-if="state.busy" class="checkout-loading" role="status">正在获取支付信息…</div>
          <template v-else-if="isBank">
            <div class="checkout-bank-summary"><strong>{{ formatMoney(amount) }}</strong><span>{{ state.order?.id }}</span><p v-if="state.order?.kind === 'package'">对公转账按优惠后全额付款，不使用账户余额。</p></div>
            <div class="checkout-bank-grid">
              <div><h3>收款信息</h3><dl><template v-for="[key, label] in bankFields" :key="key"><template v-if="attempt.bank_snapshot?.[key]"><dt>{{ label }}</dt><dd>{{ attempt.bank_snapshot[key] }}</dd></template></template></dl><button class="checkout-secondary" @click="copyBank">复制收款信息</button></div>
              <div v-if="locked"><h3>回执已提交，等待审核</h3><p class="checkout-hint">可以关闭窗口，在订单记录中查看审核进度。审核期间不能切换支付方式。</p></div>
              <form v-else @submit.prevent="submit"><h3>提交付款回执</h3><p v-if="submission?.status === 'rejected'" class="checkout-error">驳回原因：{{ submission.note }}</p><label>企业名称／付款人姓名<input v-model="payer" maxlength="255" required autocomplete="name" /></label><label>联系电话<input v-model="phone" type="tel" maxlength="40" required autocomplete="tel" /></label><label>付款回执<input type="file" accept="image/jpeg,image/png,application/pdf" required @change="receipt = $event.target.files[0]" /></label><p class="checkout-hint">支持 JPG、PNG、PDF，单份不超过 10 MB。</p><button class="checkout-primary" :disabled="submitting">{{ submitting ? '正在提交…' : '提交审核' }}</button></form>
            </div>
          </template>
          <div v-else-if="attempt" class="checkout-pay-grid">
            <div class="checkout-qr"><img v-if="image" :src="image" alt="支付二维码" /><div v-else class="checkout-qr-placeholder">{{ attempt.status === 'creating' ? '通道正在确认订单' : '正在生成二维码…' }}</div><div v-if="expired || attempt.status === 'creating'" class="checkout-qr-cover"><strong>{{ expired ? '二维码已过期' : '支付信息暂未就绪' }}</strong><button @click="controller.refresh">{{ expired ? '↻ 点击刷新' : '重试获取' }}</button></div></div>
            <div class="checkout-payment-info"><div class="checkout-amount">{{ formatMoney(amount) }}</div><p v-if="attempt.balance_fen > 0" class="checkout-hint">余额抵扣 {{ formatMoney(attempt.balance_fen) }}</p><p v-if="state.order?.balance_fen !== undefined && attempt.balance_fen > state.order.balance_fen" class="checkout-error">账户余额已变化，请先补足 {{ formatMoney(attempt.balance_fen - state.order.balance_fen) }}。如果已扫码付款，请勿重复支付，补足后会自动开通。</p><p>{{ attempt.qr_code ? '请使用对应支付应用扫码支付' : '请扫码打开通道收银台，继续完成支付' }}</p><p v-if="!expired" class="checkout-hint">有效期剩余 {{ remaining }}，支付成功后自动关闭。</p><a v-if="attempt.pay_url && !expired" class="checkout-mobile-link" :href="attempt.pay_url" target="_blank" rel="noopener noreferrer">前往支付</a><p class="checkout-hint">切换或刷新后，请使用当前二维码，避免重复付款。</p></div>
          </div>
          <p v-else-if="state.methods.length" class="checkout-empty">选择上方支付方式后，在这里完成支付。</p>
          <p v-if="receiptError" role="status" class="checkout-hint">{{ receiptError }}</p>
          <footer class="checkout-footer"><button class="checkout-text" @click="loadHistory">{{ showHistory ? '收起订单记录' : '查看订单记录／对公审核进度' }}</button><span v-if="state.order">订单 {{ state.order.id }}</span></footer>
          <div v-if="showHistory" class="checkout-history"><p v-if="historyError" role="alert">{{ historyError }}</p><p v-else-if="!history.length">暂无订单</p><button v-for="order in history" :key="order.id" :disabled="order.status === 'paid'" @click="resume(order)"><span>{{ order.title }} · {{ formatMoney(order.total_fen) }}</span><span>{{ labels[order.display_status || order.status] || order.status }}{{ order.status !== 'paid' ? ' · 查看' : '' }}</span></button></div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.checkout-overlay{--text-primary:#f5f5f5;--bg-primary:#111;--bg-secondary:#181818;--bg-tertiary:#242424;--bg-hover:#ffffff16;--border-color:#ffffff24;position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);color:var(--text-primary,#f5f5f5)}
.checkout-card{width:min(760px,100%);max-height:90dvh;overflow:auto;background:var(--bg-secondary,#181818);border:1px solid var(--border-color,rgba(255,255,255,.12));border-radius:20px;box-shadow:0 20px 70px #0006;outline:none}
.checkout-header{display:flex;justify-content:space-between;align-items:flex-start;padding:26px 28px 20px;border-bottom:1px solid var(--border-color,#ffffff14)}
.checkout-header h2{font-size:23px;font-weight:650;margin:0}.checkout-header p{margin:7px 0 0;font-size:13px;opacity:.6}.checkout-close{background:none;border:0;font-size:28px;line-height:1;color:inherit;opacity:.65;cursor:pointer;padding:0 4px}
.checkout-content{padding:24px 28px}.checkout-methods{display:flex;gap:10px;flex-wrap:wrap}.checkout-methods button,.checkout-secondary{padding:10px 15px;border:1px solid var(--border-color,#ffffff24);border-radius:9px;background:var(--bg-tertiary,#242424);color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-size:14px}.checkout-methods button.selected{border-color:currentColor;background:var(--bg-hover,#ffffff16)}.checkout-methods img{width:20px;height:20px;object-fit:contain}
button:disabled{opacity:.45;cursor:default}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid currentColor;outline-offset:3px}.checkout-loading,.checkout-empty{padding:42px 0;text-align:center;opacity:.6}.checkout-error{color:#ef6464;font-size:14px;margin:14px 0}.checkout-hint{opacity:.65;font-size:13px;line-height:1.7;margin:12px 0}
.checkout-pay-grid{display:grid;grid-template-columns:240px 1fr;gap:28px;align-items:center;padding:26px 0}.checkout-qr{position:relative;width:240px;height:240px;background:white;border-radius:12px;overflow:hidden}.checkout-qr img{width:100%;height:100%;display:block}.checkout-qr-placeholder{display:flex;align-items:center;justify-content:center;height:100%;color:#333;font-size:14px}.checkout-qr-cover{position:absolute;inset:0;background:#191b20ed;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;color:#fff}.checkout-qr-cover button{border:0;background:none;color:#6aaaff;cursor:pointer;font-size:15px}.checkout-amount{font-size:36px;font-weight:650;margin-bottom:18px}.checkout-payment-info>p{font-size:14px;line-height:1.7}.checkout-mobile-link{display:none}
.checkout-bank-summary{margin:24px 0}.checkout-bank-summary strong{font-size:28px}.checkout-bank-summary span{display:block;font-size:12px;opacity:.5;margin:8px 0;overflow-wrap:anywhere}.checkout-bank-summary p{font-size:13px;opacity:.7}.checkout-bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.checkout-bank-grid h3{font-size:16px;font-weight:600;margin-bottom:18px}dl{font-size:13px;line-height:1.7}dt{opacity:.6;margin-top:10px}dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}.checkout-secondary{margin-top:20px}.checkout-bank-grid label{display:block;font-size:13px;margin:14px 0}.checkout-bank-grid input{display:block;box-sizing:border-box;width:100%;margin-top:8px;padding:10px;border:1px solid var(--border-color,#ffffff24);border-radius:8px;background:var(--bg-primary,#111);color:inherit}.checkout-primary{background:var(--text-primary,#f5f5f5);color:var(--bg-primary,#111);border:0;border-radius:9px;padding:11px 20px;font-weight:600;cursor:pointer}
.checkout-footer{border-top:1px solid var(--border-color,#ffffff14);padding-top:18px;margin-top:20px;display:flex;flex-direction:column;gap:12px;align-items:flex-start}.checkout-text{background:none;border:0;color:inherit;opacity:.65;font-size:12px;cursor:pointer;padding:0}.checkout-footer span{font-size:11px;opacity:.4;overflow-wrap:anywhere}.checkout-history{margin-top:12px}.checkout-history button{display:flex;justify-content:space-between;gap:12px;background:transparent;border:0;border-bottom:1px solid var(--border-color,#ffffff14);padding:14px 0;color:inherit;width:100%;text-align:left;cursor:pointer;font-size:13px}
:global(html:not(.dark) .checkout-overlay:not(.checkout-canvas)),:global(html.canvas-theme-light .checkout-overlay.checkout-canvas){--text-primary:#171717;--bg-primary:#fff;--bg-secondary:#fafafa;--bg-tertiary:#f0f0f0;--bg-hover:#e8e8e8;--border-color:#ddd}
@media(max-width:600px){.checkout-overlay{padding:12px}.checkout-card{border-radius:16px;max-height:94dvh}.checkout-header{padding:20px}.checkout-content{padding:20px}.checkout-pay-grid{grid-template-columns:1fr;gap:18px}.checkout-qr{margin:auto}.checkout-payment-info{text-align:center}.checkout-amount{font-size:30px;margin-bottom:10px}.checkout-bank-grid{grid-template-columns:1fr}.checkout-mobile-link{display:inline-block;color:inherit;text-decoration:underline;padding:8px}.checkout-methods button{flex:1;justify-content:center}.checkout-history button{flex-direction:column;gap:4px}}
</style>

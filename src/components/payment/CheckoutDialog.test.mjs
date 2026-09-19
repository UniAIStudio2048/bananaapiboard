import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ref, shallowRef, computed } from 'vue'
import QRCode from 'qrcode/lib/browser.js'
const source = readFileSync(new URL('./CheckoutDialog.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
function fixture(qrcode = QRCode) {
  const watchers = []
  const ctx = { ref, shallowRef, computed, QRCode: qrcode, useCurrencyDisplay: () => ({ formatMoney: String }), checkoutApi: {}, checkoutRequest: ref(null), closeCheckout() {}, createCheckoutController: () => ({}), watch: (...args) => watchers.push(args), onBeforeUnmount() {} }
  runInNewContext(source, ctx)
  return {
    set: value => { ctx.value = value; runInNewContext('state.value = { attempt: value }', ctx) },
    render: () => watchers[1][1](ctx.value?.qr_code || ctx.value?.pay_url),
    get: name => runInNewContext(`typeof ${name} === 'undefined' ? undefined : ${name}.value`, ctx)
  }
}
test('payment codes render without DOM canvas or data-URL export', async () => {
  const f = fixture(); f.set({ id: 'one', qr_code: 'weixin://wxpay/bizpayurl?pr=test' }); await f.render()
  assert.match(f.get('svg') || '', /^<svg /); assert.match(f.get('svg'), /<path /)
})
test('supplied PNG codes remain images, never raw HTML', async () => {
  const f = fixture(); f.set({ qr_code: 'data:image/png;base64,AAAA' }); await f.render()
  assert.equal(f.get('image'), 'data:image/png;base64,AAAA'); assert.ok(!f.get('svg'))
})
test('unencodable content shows an error and rendering the same attempt can recover', async () => {
  const f = fixture(); f.set({ id: 'one', pay_url: 'x'.repeat(10000) }); await f.render()
  assert.ok(f.get('qrError')); assert.ok(!f.get('svg'))
  f.set({ id: 'one', pay_url: 'https://example.test/pay' }); await f.render()
  assert.equal(f.get('qrError'), ''); assert.match(f.get('svg'), /^<svg /)
})
test('late QR results never replace a newer code or a closed checkout', async () => {
  const jobs = []; const f = fixture({ toString: () => new Promise(resolve => jobs.push(resolve)) })
  f.set({ id: 'one', qr_code: 'first' }); const first = f.render()
  f.set({ id: 'two', qr_code: 'second' }); const second = f.render()
  jobs[1]('<svg second/>'); await second; jobs[0]('<svg first/>'); await first
  assert.equal(f.get('svg'), '<svg second/>')
  f.set({ id: 'three', qr_code: 'third' }); const third = f.render(); f.set(null); await f.render()
  jobs[2]('<svg third/>'); await third; assert.equal(f.get('svg'), '')
})
test('payment payload is encoded as geometry, never inserted as HTML', async () => {
  const f = fixture(); f.set({ qr_code: '<svg onload="alert(1)"><script>bad()</script></svg>' }); await f.render()
  assert.match(f.get('svg') || '', /^<svg /); assert.doesNotMatch(f.get('svg'), /onload|script|bad/)
})

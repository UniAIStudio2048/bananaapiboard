import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, createSSRApp, h, nextTick, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'

let currentPolicy = { registration_enabled: true, registration_mode: 'email', sms: { login: ['CN'], register: ['CN'] } }
globalThis.__readPhoneAuthTestPolicy = async () => structuredClone(currentPolicy)
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/api/sms') return { shortCircuit: true, url: 'data:text/javascript,export const smsRequest=(...args)=>globalThis.__readPhoneAuthTestPolicy(...args);export const completeSmsAuthentication=()=>{};' }
    if (specifier === '@/i18n') return { shortCircuit: true, url: "data:text/javascript,export const useI18n=()=>({currentLanguage:{value:'zh-CN'}});" }
    if (specifier.startsWith('@/')) return nextResolve(new URL(`../../${specifier.slice(2)}${/\.(vue|js)$/.test(specifier) ? '' : '.js'}`, import.meta.url).href, context)
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.vue')) {
      const { descriptor } = parse(readFileSync(new URL(url), 'utf8'), { filename: new URL(url).pathname })
      return { shortCircuit: true, format: 'module', source: compileScript(descriptor, { id: url, inlineTemplate: true }).content }
    }
    return nextLoad(url, context)
  }
})
const { default: PhoneAuthForm } = await import('./PhoneAuthForm.vue')
const { default: PhoneVerificationFields } = await import('./PhoneVerificationFields.vue')
const { default: PhoneCountrySelect } = await import('./PhoneCountrySelect.vue')
const { useSmsAuth } = await import('../../composables/useSmsAuth.js')
hooks.deregister()
const renderer = createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {}, setElementText() {}, setText() {}, parentNode() {}, nextSibling() {}, patchProp() {} })
const settle = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)) }

test('domestic SMS fields hide the country code and accept a bare phone number', async () => {
  const html = await renderToString(createSSRApp(PhoneVerificationFields, { modelValue: { phone: '13800138000', country: 'CN' }, countries: ['CN'], purpose: 'register' }))
  assert.doesNotMatch(html, /<select|\+86/)
  assert.match(html, /13800138000/)
})
test('international SMS fields offer the configured country choices', async () => {
  const html = await renderToString(createSSRApp(PhoneVerificationFields, { modelValue: { phone: '', country: 'US' }, countries: ['CN', 'US'], purpose: 'login' }))
  assert.match(html, /<select/)
  assert.match(html, /US \+1/)
})
test('phone registration has no email field even when email policy previously required it', async () => {
  const html = await renderToString(createSSRApp(PhoneAuthForm, { mode: 'register', policy: { ...currentPolicy, registration_mode: 'phone' } }))
  assert.doesNotMatch(html, /type="email"|邮箱/)
  assert.match(html, /type="tel"/)
})
test('unified password login shows country selection only for international phone input', async () => {
  for (const [countries, account, visible] of [[['CN'], '13800138000', false], [['CN', 'US'], 'user@example.com', false], [['CN', 'US'], '昵称', false], [['CN', 'US'], '4155552671', true]]) {
    const html = await renderToString(createSSRApp(PhoneCountrySelect, { countries, account, modelValue: 'CN' }))
    assert.equal(html.includes('<select'), visible, account)
  }
})
test('entering registration refreshes the tenant policy for both theme consumers', async t => {
  const mode = ref('login'), resetMode = ref(false)
  let auth
  const app = renderer.createApp({ setup() { auth = useSmsAuth(mode, resetMode); return () => h('div') } })
  app.mount({}); t.after(() => app.unmount())
  await settle()
  assert.equal(auth.phoneFormMode.value, '')
  currentPolicy = { ...currentPolicy, registration_mode: 'phone' }
  mode.value = 'register'
  await settle()
  assert.equal(auth.phoneFormMode.value, 'register')
  mode.value = 'login'; await settle()
  currentPolicy = { ...currentPolicy, registration_mode: 'email' }
  mode.value = 'register'; await settle()
  assert.equal(auth.phoneFormMode.value, '')
})

test('latest policy response wins when opening and switching modes overlap', async t => {
  const mode = ref('login'), resetMode = ref(false)
  let auth
  const app = renderer.createApp({ setup() { auth = useSmsAuth(mode, resetMode); return () => h('div') } })
  app.mount({}); t.after(() => app.unmount()); await settle()
  const pending = []
  globalThis.__readPhoneAuthTestPolicy = () => new Promise(resolve => pending.push(resolve))
  t.after(() => { globalThis.__readPhoneAuthTestPolicy = async () => structuredClone(currentPolicy) })
  const older = auth.loadAuthPolicy(), newer = auth.loadAuthPolicy()
  pending[1]({ ...currentPolicy, registration_mode: 'phone' }); await newer
  pending[0]({ ...currentPolicy, registration_mode: 'email' }); await older
  assert.equal(auth.policy.value.registration_mode, 'phone')
  assert.equal(auth.policyLoading.value, false)
})

test('SMS login is hidden when disabled and exits the selected SMS form after disabling', async t => {
  currentPolicy = { registration_enabled: true, registration_mode: 'email', sms: { login: [], retrieve: [] } }
  const mode = ref('login'), resetMode = ref(false)
  let auth
  const app = renderer.createApp({ setup() { auth = useSmsAuth(mode, resetMode); return () => h('div') } })
  app.mount({}); t.after(() => app.unmount()); await settle()
  auth.smsLogin.value = true
  assert.equal(auth.phoneFormMode.value, '')
  assert.equal(auth.showSmsMethod.value, false)
  currentPolicy = { ...currentPolicy, sms: { login: ['CN'], retrieve: [] } }
  await auth.loadAuthPolicy()
  assert.equal(auth.showSmsMethod.value, true)
  auth.smsLogin.value = true
  assert.equal(auth.phoneFormMode.value, 'login')
  currentPolicy = { ...currentPolicy, sms: { login: [], retrieve: [] } }
  await auth.loadAuthPolicy()
  assert.equal(auth.showSmsMethod.value, false)
  assert.equal(auth.smsLogin.value, false)
  assert.equal(auth.phoneFormMode.value, '')
})

test('SMS method uses current capability and hides stale options during refresh or failure', async t => {
  currentPolicy = { registration_enabled: true, registration_mode: 'phone', sms: { login: ['CN'], retrieve: [] } }
  const mode = ref('login'), resetMode = ref(false)
  let auth
  const app = renderer.createApp({ setup() { auth = useSmsAuth(mode, resetMode); return () => h('div') } })
  app.mount({}); t.after(() => app.unmount()); await settle()
  assert.equal(auth.showSmsMethod.value, true)
  resetMode.value = true
  assert.equal(auth.showSmsMethod.value, false)
  resetMode.value = false
  let reject
  globalThis.__readPhoneAuthTestPolicy = () => new Promise((_, fail) => { reject = fail })
  t.after(() => { globalThis.__readPhoneAuthTestPolicy = async () => structuredClone(currentPolicy) })
  auth.smsLogin.value = true
  const request = auth.loadAuthPolicy()
  assert.equal(auth.showSmsMethod.value, false)
  reject(new Error('unavailable')); await request
  assert.equal(auth.showSmsMethod.value, false)
  assert.equal(auth.smsLogin.value, false)
  assert.equal(auth.phoneFormMode.value, '')
})

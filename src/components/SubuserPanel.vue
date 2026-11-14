<script setup>
import { t as translateUi, currentLanguage as uiLanguage } from '@/i18n'

import { computed, onMounted, ref } from 'vue'

const props = defineProps({ request: { type: Function, required: true }, parentId: { type: String, default: '' } })
const base = computed(() => props.parentId ? `/api/admin/users/${encodeURIComponent(props.parentId)}/subusers` : '/api/subusers')
const users = ref([])
const summary = ref({})
const historySettings = ref(null)
const historySettingsBusy = ref(false)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const forbidden = ref(false)
const search = ref('')
const status = ref('')
const page = ref(1)
const total = ref(0)
const groups = ref([])
const modal = ref('')
const target = ref(null)
const batch = ref(null)
const details = ref(null)
const ledgerItems = ref([])
const ledgerPage = ref(1)
const ledgerTotal = ref(0)
const form = ref({})
const requestId = ref('')
const labels = { get create() { return translateUi('uiMessages.ma84fdcb1634a') }, get edit() { return translateUi('uiMessages.m6e7ecbfdeb6c') }, get password() { return translateUi('uiMessages.md70928debc2e') }, get group() { return translateUi('uiMessages.m2bd653506008') }, get allocate() { return translateUi('uiMessages.m9b000b3bf539') }, get revoke() { return translateUi('uiMessages.m22d08b7f4997') }, get expiry() { return translateUi('uiMessages.m0a8f2343b1f4') }, get delete() { return translateUi('uiMessages.md0fa790e5593') } }
const date = value => Number(value) ? new Date(Number(value)).toLocaleString(uiLanguage.value) : translateUi('uiMessages.m1997cb23f6ee')
const points = value => Number(value || 0).toLocaleString(uiLanguage.value, { maximumFractionDigits: 2 })
const groupSource = value => ({ inherit: translateUi('uiMessages.m22d8e48d844f'), owner: translateUi('uiMessages.mdcf7ed7d7d2d'), tenant: translateUi('uiMessages.m99452e8ddd00'), package: translateUi('packages.features') }[value] || translateUi('uiMessages.m48f704ee4869'))
const allocationStatus = value => ({ active: translateUi('uiMessages.m4d99c976beb8'), depleted: translateUi('uiMessages.m4db0a6fd5841'), expired: translateUi('uiMessages.mb9d8853e0ce7'), revoked: translateUi('uiMessages.mfa8c862601db') }[value] || value)
const ledgerType = value => ({ subuser_allocate: translateUi('uiMessages.mfc135337a267'), subuser_revoke: translateUi('uiMessages.m72d2ea240004'), subuser_expire: translateUi('uiMessages.m0ead94e9ab31'), subuser_refund: translateUi('pointsType.refund') }[value] || (value.includes('refund') ? translateUi('pointsType.refund') : translateUi('uiMessages.m80716311485a')))
const id = () => globalThis.crypto?.randomUUID?.() || `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`
const notifyError = e => { error.value = e.message || translateUi('uiMessages.mb10d00fcbb77'); forbidden.value = e.status === 403 }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ q: search.value, status: status.value, page: String(page.value) })
    const data = await props.request(`${base.value}?${params}`)
    users.value = data.users || []
    summary.value = data.summary || {}
    total.value = data.total || 0
    forbidden.value = false
  } catch (e) { notifyError(e) } finally { loading.value = false }
}
async function loadLedger() {
  const data = await props.request(`${base.value}/${target.value.id}/ledger?page=${ledgerPage.value}`)
  ledgerItems.value = data.records || []
  ledgerTotal.value = data.total || 0
}
async function showDetails(user) {
  target.value = user
  busy.value = true
  error.value = ''
  try {
    details.value = await props.request(`${base.value}/${user.id}`)
    ledgerPage.value = 1
    await loadLedger()
  } catch (e) { notifyError(e) } finally { busy.value = false }
}
async function open(mode, user = null, allocation = null) {
  target.value = user
  batch.value = allocation
  form.value = { username: user?.username || '', email: user?.email || '', password: '', amount: '', permanent: !allocation?.expires_at, expires: allocation?.expires_at ? new Date(Number(allocation.expires_at) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '', group_id: user?.base_group_id || '' }
  requestId.value = id()
  error.value = ''
  if (mode === 'group') {
    try { groups.value = (await props.request(`${base.value}/groups`)).groups || [] } catch (e) { notifyError(e); return }
  }
  if (mode === 'delete') {
    try { details.value = await props.request(`${base.value}/${user.id}`) } catch (e) { notifyError(e); return }
  }
  modal.value = mode
}
async function changeStatus(user) {
  busy.value = true
  error.value = ''
  const ownBan = props.parentId ? user.tenant_disabled : user.owner_disabled
  try { await props.request(`${base.value}/${user.id}/status`, { method: 'PATCH', body: { disabled: !ownBan } }); notice.value = ownBan ? translateUi('uiMessages.m366fdf622e23') : translateUi('uiMessages.meb9d062bae33'); await load() } catch (e) { notifyError(e) } finally { busy.value = false }
}
async function submit() {
  busy.value = true
  error.value = ''
  try {
    let url = base.value
    let method = 'POST'
    let body = {}
    const mode = modal.value
    if (mode !== 'create') url += `/${target.value.id}`
    const expires = form.value.permanent ? 0 : new Date(form.value.expires).getTime()
    if (['create', 'allocate', 'expiry'].includes(mode) && (!Number.isFinite(expires) || (expires && expires <= Date.now()))) throw new Error(translateUi('uiMessages.m09c2ac241c1b'))
    if (mode === 'create') body = { username: form.value.username, email: form.value.email, password: form.value.password, amount: form.value.amount || 0, expires_at: expires, request_id: requestId.value }
    if (mode === 'edit') { method = 'PATCH'; body = { username: form.value.username, email: form.value.email } }
    if (mode === 'password') { url += '/password'; body = { password: form.value.password } }
    if (mode === 'group') { url += '/group'; method = 'PATCH'; body = { group_id: form.value.group_id || null } }
    if (mode === 'allocate') { url += '/allocations'; body = { amount: form.value.amount, expires_at: expires, request_id: requestId.value } }
    if (mode === 'revoke') { url += batch.value ? `/allocations/${batch.value.id}/revoke` : '/revoke'; body = { amount: form.value.amount || null, request_id: requestId.value } }
    if (mode === 'expiry') { url += `/allocations/${batch.value.id}`; method = 'PATCH'; body = { expires_at: expires, request_id: requestId.value } }
    if (mode === 'delete') { method = 'DELETE'; body = undefined }
    await props.request(url, { method, body })
    notice.value = mode === 'delete' ? translateUi('uiMessages.m5c184c12b18c') : translateUi('uiMessages.mb0512b6d34b3', { value1: (labels[mode]) })
    modal.value = ''
    form.value.password = ''
    await load()
    if (details.value && target.value && mode !== 'delete') await showDetails(target.value)
    if (mode === 'delete') details.value = null
  } catch (e) { notifyError(e) } finally { busy.value = false }
}
async function retryDeletion(user) {
  busy.value = true
  try { await props.request(`${base.value}/${user.id}/retry-deletion`, { method: 'POST' }); await load() } catch (e) { notifyError(e) } finally { busy.value = false }
}
async function loadHistorySettings() {
  historySettingsBusy.value = true
  try { historySettings.value = await props.request(`${base.value}/history-settings`) } catch (e) { notifyError(e) } finally { historySettingsBusy.value = false }
}
async function toggleHistoryDeletion() {
  if (!historySettings.value || historySettingsBusy.value) return
  historySettingsBusy.value = true
  error.value = ''
  notice.value = ''
  try {
    historySettings.value = await props.request(`${base.value}/history-settings`, { method: 'PATCH', body: { history_delete_disabled: !historySettings.value.history_delete_disabled } })
    notice.value = historySettings.value.history_delete_disabled ? translateUi('uiMessages.mf26cb1ffd9ff') : translateUi('uiMessages.me964f6414d5f')
  } catch (e) { notifyError(e) } finally { historySettingsBusy.value = false }
}
onMounted(load)
onMounted(loadHistorySettings)
</script>

<template>
  <section class="subuser-panel" :class="{ 'admin-panel': parentId }">
    <header class="heading"><div><h1>{{ translateUi('uiMessages.md19c97e3879d') }}</h1><p>{{ translateUi('uiMessages.mfa4918cebf73') }}</p></div><button class="primary" :disabled="loading || busy || forbidden || summary.can_create === false || status === 'deleted'" @click="open('create')">{{ translateUi('uiMessages.ma84fdcb1634a') }}</button></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <div class="overview">
      <div><span>{{ translateUi('uiMessages.m5fde729c34a1') }}</span><strong>{{ summary.current_count || 0 }}</strong><small>{{ translateUi('uiMessages.mb4a885d4b3d5', { value1: (summary.cumulative_count || 0) }) }}</small><small v-if="summary.effective_limit != null">{{ translateUi('uiMessages.mfa4ee56e64dd', { value1: (summary.effective_limit === -1 ? translateUi('uiMessages.mf203d577d142') : summary.effective_limit), value2: (summary.can_create === false ? translateUi('uiMessages.m8f03f4b9071e') : '') }) }}</small></div>
      <div><span>{{ translateUi('uiMessages.m7e26e46d095a') }}</span><strong>{{ points(summary.permanent_points) }}</strong><small>{{ translateUi('uiMessages.m17d01d483d75') }}</small></div>
      <div><span>{{ translateUi('uiMessages.m973817955366') }}</span><strong>{{ points(summary.remaining) }}</strong><small>{{ translateUi('uiMessages.m803cd660ef10') }}</small></div>
      <div><span>{{ translateUi('uiMessages.mbf0a8459b626') }}</span><strong>{{ points(summary.consumed) }}</strong><small>{{ translateUi('uiMessages.m91101ec0b5ba') }}</small></div>
    </div>
    <section class="history-settings" aria-labelledby="history-settings-title">
      <div><h2 id="history-settings-title">{{ translateUi('uiMessages.m3d0138d4425c') }}</h2><p id="history-settings-description">{{ translateUi('uiMessages.mc1766e0b98f1') }}</p></div>
      <button type="button" class="history-switch" :class="{ enabled: historySettings?.history_delete_disabled }" role="switch" :aria-checked="!!historySettings?.history_delete_disabled" aria-labelledby="history-settings-title" aria-describedby="history-settings-description" :disabled="!historySettings || historySettingsBusy || forbidden" @click="toggleHistoryDeletion"><span></span></button>
    </section>
    <form class="filters" @submit.prevent="page = 1; load()"><input v-model="search" :aria-label="translateUi('uiMessages.m7b2ad64627e3')" :placeholder="translateUi('uiMessages.m5645a9f7777c')" /><select v-model="status" :aria-label="translateUi('uiMessages.m449636a1fe8d')" @change="page = 1; load()"><option value="">{{ translateUi('uiMessages.m26cf194c6180') }}</option><option value="active">{{ translateUi('uiMessages.m296de0e31f8c') }}</option><option value="disabled">{{ translateUi('uiMessages.mca0ea6411578') }}</option><option value="deleted">{{ translateUi('uiMessages.m291746ed423f') }}</option></select><button :disabled="loading">{{ translateUi('uiMessages.mbcd6771e08ec') }}</button></form>
    <div class="table-wrap"><table><thead><tr><th>{{ translateUi('uiMessages.m311bb313fdec') }}</th><th>{{ translateUi('uiMessages.m6320b4a8722a') }}</th><th>{{ translateUi('uiMessages.m728d5927901c') }}</th><th>{{ translateUi('uiMessages.m9b000b3bf539') }}</th><th>{{ translateUi('uiMessages.m5de975988513') }}</th><th>{{ translateUi('uiMessages.med31fbb483ee') }}</th></tr></thead><tbody>
      <tr v-if="loading"><td colspan="6" class="empty">{{ translateUi('uiMessages.m21bd738e0d71') }}</td></tr>
      <tr v-else-if="!users.length"><td colspan="6" class="empty">{{ forbidden ? translateUi('uiMessages.md6c5cbe139d3') : translateUi('uiMessages.m32c6b5aa22fb') }}</td></tr>
      <tr v-for="user in users" v-else :key="user.id"><td><strong>{{ user.username }}</strong><small>{{ user.email || translateUi('user.noEmail') }}</small></td><td><span :class="user.disabled ? 'badge blocked' : 'badge'">{{ user.deleted_at ? user.deletion_status === 'settling' ? translateUi('uiMessages.m00fc7cd758c1') : translateUi('tips.deleted') : user.disabled ? translateUi('uiMessages.mca0ea6411578') : translateUi('uiMessages.m296de0e31f8c') }}</span><small v-if="user.tenant_disabled">{{ translateUi('uiMessages.mdf57213db534') }}</small><small v-if="user.parent_disabled">{{ translateUi('uiMessages.m96488f13bcc8') }}</small></td><td>{{ user.user_group_name || translateUi('uiMessages.m48f704ee4869') }}<small>{{ groupSource(user.group_source) }}</small></td><td>{{ points(user.subuser_points) }}</td><td>{{ points(Number(user.points) + Number(user.package_points)) }}<small>{{ translateUi('uiMessages.m999b2628314e', { value1: (points(user.points)), value2: (points(user.package_points)) }) }}</small></td><td class="actions">
        <button :disabled="busy" @click="showDetails(user)">{{ translateUi('uiMessages.m206ea896472e') }}</button>
        <template v-if="!user.deleted_at"><button :disabled="busy" @click="open('allocate', user)">{{ translateUi('uiMessages.mfc135337a267') }}</button><button :disabled="busy" @click="open('revoke', user)">{{ translateUi('uiMessages.m72d2ea240004') }}</button><button :disabled="busy" @click="open('group', user)">{{ translateUi('uiMessages.m337717173807') }}</button><button :disabled="busy" @click="open('edit', user)">{{ translateUi('common.edit') }}</button><button :disabled="busy" @click="open('password', user)">{{ translateUi('uiMessages.mf42ec33a1360') }}</button><button :disabled="busy" @click="changeStatus(user)">{{ (parentId ? user.tenant_disabled : user.owner_disabled) ? translateUi('uiMessages.mf375a0009c57') : translateUi('uiMessages.m6f93ba4c79f8') }}</button><button class="danger" :disabled="busy" @click="open('delete', user)">{{ translateUi('common.delete') }}</button></template>
        <button v-else-if="user.deletion_status === 'settling'" :disabled="busy" @click="retryDeletion(user)">{{ translateUi('uiMessages.mef71de6509be') }}</button>
      </td></tr>
    </tbody></table></div>
    <footer class="pagination"><span>{{ translateUi('uiMessages.m5722242e7b58', { value1: (total) }) }}</span><button :disabled="page <= 1 || loading" @click="page--; load()">{{ translateUi('uiMessages.mc9b9ae7a6144') }}</button><span>{{ page }}</span><button :disabled="page * 20 >= total || loading" @click="page++; load()">{{ translateUi('uiMessages.m8a8542f69648') }}</button></footer>
    <section v-if="details && !modal" class="details"><header class="heading"><h2>{{ translateUi('uiMessages.m475eaa4934d8', { value1: (details.user.username) }) }}</h2><button @click="details = null">{{ translateUi('common.close') }}</button></header><p>{{ translateUi('uiMessages.m11cee6078d31', { value1: (points(Number(details.user.balance) / 100)), value2: (details.pending) }) }}</p>
      <div class="table-wrap"><table><thead><tr><th>{{ translateUi('uiMessages.m9b21e55ad327') }}</th><th>{{ translateUi('uiMessages.md6822b04178d') }}</th><th>{{ translateUi('uiMessages.m52a60d2c400b') }}</th><th>{{ translateUi('uiMessages.m3233f30c720c') }}</th><th>{{ translateUi('uiMessages.m9c2a28e8f98f') }}</th><th>{{ translateUi('uiMessages.m6320b4a8722a') }}</th><th>{{ translateUi('uiMessages.med31fbb483ee') }}</th></tr></thead><tbody><tr v-if="!details.allocations.length"><td colspan="7">{{ translateUi('uiMessages.m3998446278a4') }}</td></tr><tr v-for="allocation in details.allocations" :key="allocation.id"><td>{{ points(allocation.allocated_points) }}</td><td>{{ points(allocation.remaining_points) }}</td><td>{{ points(allocation.consumed_points) }}</td><td>{{ points(allocation.returned_points) }}</td><td>{{ date(allocation.expires_at) }}</td><td>{{ allocationStatus(allocation.status) }}</td><td><template v-if="!details.user.deleted_at && ['active','depleted'].includes(allocation.status)"><button :disabled="busy" @click="open('expiry', details.user, allocation)">{{ translateUi('uiMessages.m0a8f2343b1f4') }}</button><button v-if="Number(allocation.remaining_points) > 0" :disabled="busy" @click="open('revoke', details.user, allocation)">{{ translateUi('uiMessages.m72d2ea240004') }}</button></template></td></tr></tbody></table></div>
      <h3>{{ translateUi('user.pointsHistory') }}</h3><div class="table-wrap"><table><thead><tr><th>{{ translateUi('user.transactionTime') }}</th><th>{{ translateUi('uiMessages.med31fbb483ee') }}</th><th>{{ translateUi('uiMessages.m1d08a02a5b04') }}</th><th>{{ translateUi('uiMessages.m4262c45dc797') }}</th></tr></thead><tbody><tr v-for="item in ledgerItems" :key="item.id"><td>{{ date(item.created_at) }}</td><td>{{ item.type === 'subuser_expiry_change' ? translateUi('uiMessages.m0a8f2343b1f4') : item.type === 'group_inherit_reset' ? translateUi('uiMessages.m3c72986d32d9') : ledgerType(item.type) }}</td><td>{{ Number(item.value) > 0 ? '+' : '' }}{{ points(item.value) }}</td><td>{{ item.type === 'subuser_expiry_change' ? translateUi('uiMessages.md2d0f7c84c77') : item.memo }}</td></tr><tr v-if="!ledgerItems.length"><td colspan="4">{{ translateUi('uiMessages.m23e23d94a7d8') }}</td></tr></tbody></table></div><div class="pagination"><button :disabled="ledgerPage <= 1" @click="ledgerPage--; loadLedger().catch(notifyError)">{{ translateUi('uiMessages.mc9b9ae7a6144') }}</button><span>{{ ledgerPage }}</span><button :disabled="ledgerPage * 20 >= ledgerTotal" @click="ledgerPage++; loadLedger().catch(notifyError)">{{ translateUi('uiMessages.m8a8542f69648') }}</button></div>
    </section>
    <div v-if="modal" class="overlay" @click.self="!busy && (modal = '')"><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="subuser-dialog-title" @submit.prevent="submit"><h2 id="subuser-dialog-title">{{ labels[modal] }}<small v-if="target">{{ target.username }}</small></h2><p v-if="error" class="error" role="alert">{{ error }}</p>
      <template v-if="['create','edit'].includes(modal)"><label>{{ translateUi('auth.username') }}<input v-model="form.username" required maxlength="64" autocomplete="off" /></label><label>{{ translateUi('uiMessages.m3d75c5509585') }}<input v-model="form.email" type="email" maxlength="128" autocomplete="off" /></label></template>
      <label v-if="['create','password'].includes(modal)">{{ translateUi('auth.password') }}<input v-model="form.password" type="password" required minlength="6" maxlength="256" autocomplete="new-password" /></label>
      <label v-if="['create','allocate','revoke'].includes(modal)">{{ modal === 'revoke' ? translateUi('uiMessages.m8923a34da921') : modal === 'create' ? translateUi('uiMessages.m076da0e99dc0') : translateUi('uiMessages.m9b000b3bf539') }}<input v-model="form.amount" type="number" :min="modal === 'create' ? 0 : 0.01" step="0.01" :required="modal === 'allocate'" /></label>
      <template v-if="['create','allocate','expiry'].includes(modal)"><label class="checkbox"><input v-model="form.permanent" type="checkbox" />{{ translateUi('uiMessages.m1997cb23f6ee') }}</label><label v-if="!form.permanent">{{ translateUi('packages.expiresAt') }}<input v-model="form.expires" type="datetime-local" required /></label><p>{{ translateUi('uiMessages.m77ade0a89cc9') }}</p></template>
      <label v-if="modal === 'group'">{{ translateUi('uiMessages.mb32332a9d760') }}<select v-model="form.group_id"><option value="">{{ translateUi('uiMessages.m43298687d74c') }}</option><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select><small>{{ translateUi('uiMessages.md73ca84e24cf') }}</small></label>
      <template v-if="modal === 'delete'"><p>{{ translateUi('uiMessages.m827042f19fdb') }}</p><p>{{ translateUi('uiMessages.mc862049b08ed', { value1: (points(details?.user.points)), value2: (points(details?.user.package_points)), value3: (points(Number(details?.user.balance) / 100)), value4: (details?.pending || 0) }) }}</p><p>{{ translateUi('uiMessages.m066152cb8441') }}</p></template>
      <footer class="dialog-actions"><button type="button" :disabled="busy" @click="modal = ''; form.password = ''">{{ translateUi('common.cancel') }}</button><button class="primary" :class="{ danger: modal === 'delete' }" :disabled="busy">{{ busy ? translateUi('uiMessages.m6bdb4435095e') : translateUi('common.confirm') }}</button></footer>
    </form></div>
  </section>
</template>

<style scoped>
.subuser-panel{--panel:#fff;--border:#e2e8f0;--muted:#64748b;max-width:1440px;margin:auto;padding:24px;color:#0f172a;font-size:14px}.heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}.heading h1{font-size:26px;font-weight:700}.heading h2,.dialog h2{font-size:20px;font-weight:650}p,small{color:var(--muted)}p{margin:8px 0;line-height:1.6}small{display:block;font-size:12px;margin-top:4px}button,input,select{font:inherit;border:1px solid var(--border);border-radius:8px;padding:9px 12px;background:var(--panel);color:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}button:hover:enabled{border-color:#10b981}.primary{background:#047857;color:white;border-color:#047857}.danger{color:#dc2626}.primary.danger{background:#b91c1c;color:white;border-color:#b91c1c}.overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:24px 0}.overview>div{background:var(--panel);border:1px solid var(--border);padding:20px;border-radius:12px}.overview span{color:var(--muted)}.overview strong{display:block;font-size:28px;margin:8px 0}.filters{display:flex;gap:10px;margin-bottom:16px}.filters input{flex:1;min-width:0}.table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--panel)}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:14px 16px;border-bottom:1px solid var(--border);vertical-align:top}th{font-weight:500;color:var(--muted);background:rgba(128,128,128,.04)}.actions{white-space:normal;min-width:260px;max-width:330px}.actions button,.details td button{padding:4px 7px;margin:2px;font-size:12px}.badge{color:#047857;background:#d1fae5;border-radius:20px;padding:3px 8px;font-size:12px}.blocked{color:#92400e;background:#fef3c7}.empty{text-align:center;padding:48px}.pagination{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:16px}.error{padding:12px;background:#fee2e2;color:#991b1b;border-radius:8px}.notice{padding:12px;background:#d1fae5;color:#065f46;border-radius:8px}.details{margin-top:32px;border-top:1px solid var(--border);padding-top:24px}.details h3{font-weight:600;margin:24px 0 12px}.overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px}.dialog{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:24px;width:480px;max-width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px #0003}.dialog label{display:block;font-weight:500;margin-top:16px}.dialog input,.dialog select{display:block;width:100%;margin-top:6px}.dialog .checkbox{display:flex;align-items:center;gap:8px}.checkbox input{width:auto;margin:0}.dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}@media(max-width:700px){.subuser-panel{padding:16px}.overview{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.overview>div{padding:14px}.overview strong{font-size:23px}.filters{flex-wrap:wrap}.filters input{flex-basis:100%}.heading h1{font-size:22px}}.dark .subuser-panel,.canvas-theme-dark .subuser-panel{--panel:#172033;--border:#334155;--muted:#94a3b8;color:#e2e8f0}
.admin-panel{--panel:#172033;--border:#334155;--muted:#94a3b8;color:#e2e8f0}
.history-settings{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 20px;margin-bottom:20px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.history-settings h2{font-weight:600}.history-settings p{margin:6px 0 0;font-size:13px}.history-switch{flex-shrink:0;width:44px;height:26px;padding:3px;border:0;border-radius:20px;background:#94a3b8;transition:background .15s}.history-switch.enabled{background:#047857}.history-switch span{display:block;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s}.history-switch.enabled span{transform:translateX(18px)}.history-switch:focus-visible{outline:2px solid #10b981;outline-offset:3px}
</style>

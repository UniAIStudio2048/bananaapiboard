<script setup>
import { computed, onMounted, ref } from 'vue'

const props = defineProps({ request: { type: Function, required: true }, parentId: { type: String, default: '' } })
const base = computed(() => props.parentId ? `/api/admin/users/${encodeURIComponent(props.parentId)}/subusers` : '/api/subusers')
const users = ref([])
const summary = ref({})
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
const labels = { create: '创建子用户', edit: '编辑资料', password: '重置密码', group: '设置等级', allocate: '分配积分', revoke: '回收积分', expiry: '修改有效期', delete: '删除子用户' }
const date = value => Number(value) ? new Date(Number(value)).toLocaleString('zh-CN') : '永久有效'
const points = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const groupSource = value => ({ inherit: '继承主用户', owner: '主用户设置', tenant: '租户设置', package: '套餐权益' }[value] || '默认等级')
const allocationStatus = value => ({ active: '可用', depleted: '已用完', expired: '已到期', revoked: '已收回' }[value] || value)
const ledgerType = value => ({ subuser_allocate: '分配', subuser_revoke: '回收', subuser_expire: '到期回收', subuser_refund: '退款' }[value] || (value.includes('refund') ? '退款' : '消费'))
const id = () => globalThis.crypto?.randomUUID?.() || `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`
const notifyError = e => { error.value = e.message || '操作失败，请稍后重试'; forbidden.value = e.status === 403 }

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
  try { await props.request(`${base.value}/${user.id}/status`, { method: 'PATCH', body: { disabled: !ownBan } }); notice.value = ownBan ? '已解除当前管理方封禁' : '已封禁子用户'; await load() } catch (e) { notifyError(e) } finally { busy.value = false }
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
    if (['create', 'allocate', 'expiry'].includes(mode) && (!Number.isFinite(expires) || (expires && expires <= Date.now()))) throw new Error('请选择晚于当前时间的有效期')
    if (mode === 'create') body = { username: form.value.username, email: form.value.email, password: form.value.password, amount: form.value.amount || 0, expires_at: expires, request_id: requestId.value }
    if (mode === 'edit') { method = 'PATCH'; body = { username: form.value.username, email: form.value.email } }
    if (mode === 'password') { url += '/password'; body = { password: form.value.password } }
    if (mode === 'group') { url += '/group'; method = 'PATCH'; body = { group_id: form.value.group_id || null } }
    if (mode === 'allocate') { url += '/allocations'; body = { amount: form.value.amount, expires_at: expires, request_id: requestId.value } }
    if (mode === 'revoke') { url += batch.value ? `/allocations/${batch.value.id}/revoke` : '/revoke'; body = { amount: form.value.amount || null, request_id: requestId.value } }
    if (mode === 'expiry') { url += `/allocations/${batch.value.id}`; method = 'PATCH'; body = { expires_at: expires, request_id: requestId.value } }
    if (mode === 'delete') { method = 'DELETE'; body = undefined }
    await props.request(url, { method, body })
    notice.value = mode === 'delete' ? '子用户已停用，结算完成后自动回收剩余分配积分' : `${labels[mode]}成功`
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
onMounted(load)
</script>

<template>
  <section class="subuser-panel" :class="{ 'admin-panel': parentId }">
    <header class="heading"><div><h1>子用户管理</h1><p>为子用户分配积分，管理账号和使用等级。</p></div><button class="primary" :disabled="loading || busy || forbidden || summary.can_create === false || status === 'deleted'" @click="open('create')">创建子用户</button></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <div class="overview">
      <div><span>子用户</span><strong>{{ summary.current_count || 0 }}</strong><small>累计创建 {{ summary.cumulative_count || 0 }}</small><small v-if="summary.effective_limit != null">上限 {{ summary.effective_limit === -1 ? '不限' : summary.effective_limit }}{{ summary.can_create === false ? ' · 已达上限' : '' }}</small></div>
      <div><span>可分配永久积分</span><strong>{{ points(summary.permanent_points) }}</strong><small>分配时从主用户扣除</small></div>
      <div><span>分配剩余额</span><strong>{{ points(summary.remaining) }}</strong><small>仅收回未消费部分</small></div>
      <div><span>净消费积分</span><strong>{{ points(summary.consumed) }}</strong><small>已扣除退还的积分</small></div>
    </div>
    <form class="filters" @submit.prevent="page = 1; load()"><input v-model="search" aria-label="搜索子用户" placeholder="搜索用户名或邮箱" /><select v-model="status" aria-label="账号状态" @change="page = 1; load()"><option value="">全部账号</option><option value="active">正常</option><option value="disabled">已封禁</option><option value="deleted">已删除 / 结算中</option></select><button :disabled="loading">查询</button></form>
    <div class="table-wrap"><table><thead><tr><th>账号</th><th>状态</th><th>等级来源</th><th>分配积分</th><th>自有积分</th><th>操作</th></tr></thead><tbody>
      <tr v-if="loading"><td colspan="6" class="empty">正在加载…</td></tr>
      <tr v-else-if="!users.length"><td colspan="6" class="empty">{{ forbidden ? '子用户不能管理其他用户' : '暂无子用户' }}</td></tr>
      <tr v-for="user in users" v-else :key="user.id"><td><strong>{{ user.username }}</strong><small>{{ user.email || '未设置邮箱' }}</small></td><td><span :class="user.disabled ? 'badge blocked' : 'badge'">{{ user.deleted_at ? user.deletion_status === 'settling' ? '删除结算中' : '已删除' : user.disabled ? '已封禁' : '正常' }}</span><small v-if="user.tenant_disabled">租户封禁</small><small v-if="user.parent_disabled">主用户暂停</small></td><td>{{ user.user_group_name || '默认等级' }}<small>{{ groupSource(user.group_source) }}</small></td><td>{{ points(user.subuser_points) }}</td><td>{{ points(Number(user.points) + Number(user.package_points)) }}<small>永久 {{ points(user.points) }} / 套餐 {{ points(user.package_points) }}</small></td><td class="actions">
        <button :disabled="busy" @click="showDetails(user)">明细</button>
        <template v-if="!user.deleted_at"><button :disabled="busy" @click="open('allocate', user)">分配</button><button :disabled="busy" @click="open('revoke', user)">回收</button><button :disabled="busy" @click="open('group', user)">等级</button><button :disabled="busy" @click="open('edit', user)">编辑</button><button :disabled="busy" @click="open('password', user)">改密</button><button :disabled="busy" @click="changeStatus(user)">{{ (parentId ? user.tenant_disabled : user.owner_disabled) ? '解封' : '封禁' }}</button><button class="danger" :disabled="busy" @click="open('delete', user)">删除</button></template>
        <button v-else-if="user.deletion_status === 'settling'" :disabled="busy" @click="retryDeletion(user)">重试结算</button>
      </td></tr>
    </tbody></table></div>
    <footer class="pagination"><span>共 {{ total }} 个账号</span><button :disabled="page <= 1 || loading" @click="page--; load()">上一页</button><span>{{ page }}</span><button :disabled="page * 20 >= total || loading" @click="page++; load()">下一页</button></footer>
    <section v-if="details && !modal" class="details"><header class="heading"><h2>{{ details.user.username }} · 积分明细</h2><button @click="details = null">关闭</button></header><p>自有余额 {{ points(Number(details.user.balance) / 100) }}，待结算任务或订单 {{ details.pending }} 项。分配积分到期后返还主用户。</p>
      <div class="table-wrap"><table><thead><tr><th>分配额</th><th>剩余</th><th>净消费</th><th>已返还</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-if="!details.allocations.length"><td colspan="7">暂无分配记录</td></tr><tr v-for="allocation in details.allocations" :key="allocation.id"><td>{{ points(allocation.allocated_points) }}</td><td>{{ points(allocation.remaining_points) }}</td><td>{{ points(allocation.consumed_points) }}</td><td>{{ points(allocation.returned_points) }}</td><td>{{ date(allocation.expires_at) }}</td><td>{{ allocationStatus(allocation.status) }}</td><td><template v-if="!details.user.deleted_at && ['active','depleted'].includes(allocation.status)"><button :disabled="busy" @click="open('expiry', details.user, allocation)">修改有效期</button><button v-if="Number(allocation.remaining_points) > 0" :disabled="busy" @click="open('revoke', details.user, allocation)">回收</button></template></td></tr></tbody></table></div>
      <h3>积分流水</h3><div class="table-wrap"><table><thead><tr><th>时间</th><th>操作</th><th>积分变化</th><th>说明</th></tr></thead><tbody><tr v-for="item in ledgerItems" :key="item.id"><td>{{ date(item.created_at) }}</td><td>{{ item.type === 'subuser_expiry_change' ? '修改有效期' : item.type === 'group_inherit_reset' ? '恢复等级继承' : ledgerType(item.type) }}</td><td>{{ Number(item.value) > 0 ? '+' : '' }}{{ points(item.value) }}</td><td>{{ item.type === 'subuser_expiry_change' ? '分配批次有效期已更新' : item.memo }}</td></tr><tr v-if="!ledgerItems.length"><td colspan="4">暂无流水</td></tr></tbody></table></div><div class="pagination"><button :disabled="ledgerPage <= 1" @click="ledgerPage--; loadLedger().catch(notifyError)">上一页</button><span>{{ ledgerPage }}</span><button :disabled="ledgerPage * 20 >= ledgerTotal" @click="ledgerPage++; loadLedger().catch(notifyError)">下一页</button></div>
    </section>
    <div v-if="modal" class="overlay" @click.self="!busy && (modal = '')"><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="subuser-dialog-title" @submit.prevent="submit"><h2 id="subuser-dialog-title">{{ labels[modal] }}<small v-if="target">{{ target.username }}</small></h2><p v-if="error" class="error" role="alert">{{ error }}</p>
      <template v-if="['create','edit'].includes(modal)"><label>用户名<input v-model="form.username" required maxlength="64" autocomplete="off" /></label><label>邮箱（可选）<input v-model="form.email" type="email" maxlength="128" autocomplete="off" /></label></template>
      <label v-if="['create','password'].includes(modal)">密码<input v-model="form.password" type="password" required minlength="6" maxlength="256" autocomplete="new-password" /></label>
      <label v-if="['create','allocate','revoke'].includes(modal)">{{ modal === 'revoke' ? '回收金额（留空回收全部剩余）' : modal === 'create' ? '首次分配积分（可选）' : '分配积分' }}<input v-model="form.amount" type="number" :min="modal === 'create' ? 0 : 0.01" step="0.01" :required="modal === 'allocate'" /></label>
      <template v-if="['create','allocate','expiry'].includes(modal)"><label class="checkbox"><input v-model="form.permanent" type="checkbox" />永久有效</label><label v-if="!form.permanent">到期时间<input v-model="form.expires" type="datetime-local" required /></label><p>到期只回收未消费的分配积分，自有资产不受影响。</p></template>
      <label v-if="modal === 'group'">基础等级<select v-model="form.group_id"><option value="">继承主用户等级</option><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option></select><small>有效套餐等级优先，到期恢复此设置。</small></label>
      <template v-if="modal === 'delete'"><p>删除后立即停用，保留账号资产与历史，无法恢复。</p><p>自有永久积分 {{ points(details?.user.points) }}，套餐积分 {{ points(details?.user.package_points) }}，余额 {{ points(Number(details?.user.balance) / 100) }}；待结算 {{ details?.pending || 0 }} 项。</p><p>既有任务及订单结算完成后，剩余分配积分自动返还主用户。</p></template>
      <footer class="dialog-actions"><button type="button" :disabled="busy" @click="modal = ''; form.password = ''">取消</button><button class="primary" :class="{ danger: modal === 'delete' }" :disabled="busy">{{ busy ? '正在保存…' : '确认' }}</button></footer>
    </form></div>
  </section>
</template>

<style scoped>
.subuser-panel{--panel:#fff;--border:#e2e8f0;--muted:#64748b;max-width:1440px;margin:auto;padding:24px;color:#0f172a;font-size:14px}.heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}.heading h1{font-size:26px;font-weight:700}.heading h2,.dialog h2{font-size:20px;font-weight:650}p,small{color:var(--muted)}p{margin:8px 0;line-height:1.6}small{display:block;font-size:12px;margin-top:4px}button,input,select{font:inherit;border:1px solid var(--border);border-radius:8px;padding:9px 12px;background:var(--panel);color:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}button:hover:enabled{border-color:#10b981}.primary{background:#047857;color:white;border-color:#047857}.danger{color:#dc2626}.primary.danger{background:#b91c1c;color:white;border-color:#b91c1c}.overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:24px 0}.overview>div{background:var(--panel);border:1px solid var(--border);padding:20px;border-radius:12px}.overview span{color:var(--muted)}.overview strong{display:block;font-size:28px;margin:8px 0}.filters{display:flex;gap:10px;margin-bottom:16px}.filters input{flex:1;min-width:0}.table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--panel)}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:14px 16px;border-bottom:1px solid var(--border);vertical-align:top}th{font-weight:500;color:var(--muted);background:rgba(128,128,128,.04)}.actions{white-space:normal;min-width:260px;max-width:330px}.actions button,.details td button{padding:4px 7px;margin:2px;font-size:12px}.badge{color:#047857;background:#d1fae5;border-radius:20px;padding:3px 8px;font-size:12px}.blocked{color:#92400e;background:#fef3c7}.empty{text-align:center;padding:48px}.pagination{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:16px}.error{padding:12px;background:#fee2e2;color:#991b1b;border-radius:8px}.notice{padding:12px;background:#d1fae5;color:#065f46;border-radius:8px}.details{margin-top:32px;border-top:1px solid var(--border);padding-top:24px}.details h3{font-weight:600;margin:24px 0 12px}.overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px}.dialog{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:24px;width:480px;max-width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px #0003}.dialog label{display:block;font-weight:500;margin-top:16px}.dialog input,.dialog select{display:block;width:100%;margin-top:6px}.dialog .checkbox{display:flex;align-items:center;gap:8px}.checkbox input{width:auto;margin:0}.dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}@media(max-width:700px){.subuser-panel{padding:16px}.overview{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.overview>div{padding:14px}.overview strong{font-size:23px}.filters{flex-wrap:wrap}.filters input{flex-basis:100%}.heading h1{font-size:22px}}:global(.dark) .subuser-panel,:global(.canvas-theme-dark) .subuser-panel{--panel:#172033;--border:#334155;--muted:#94a3b8;color:#e2e8f0}
.admin-panel{--panel:#172033;--border:#334155;--muted:#94a3b8;color:#e2e8f0}
</style>

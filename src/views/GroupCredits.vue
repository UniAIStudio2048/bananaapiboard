<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  allocateGroupCredits,
  getGroupLedger,
  getGroupTeamMembers,
  getGroupTeams,
  revokeAllGroupMemberCredits,
  revokeGroupMemberCredits,
  updateGroupBillingPolicy
} from '@/api/group'

const router = useRouter()

const billingPolicies = [
  { value: 'legacy', label: '默认规则', note: '套餐积分优先，之后使用永久积分' },
  { value: 'team_only', label: '仅团队积分', note: '团队空间内只能使用分配的团队积分' },
  { value: 'team_first', label: '团队优先', note: '先用团队积分，再用套餐和永久积分' }
]

const teams = ref([])
const members = ref([])
const selectedTeamId = ref('')
const loading = ref(true)
const membersLoading = ref(false)
const savingPolicy = ref(false)
const errorState = ref('')
const statusMessage = ref('')

const showAllocationModal = ref(false)
const allocationSubmitting = ref(false)
const allocationTarget = ref(null)
const allocationForm = ref({
  amount: '',
  expiresMode: 'none',
  customDate: ''
})

const showRevokeMemberModal = ref(false)
const revokeMemberSubmitting = ref(false)
const revokeMemberTarget = ref(null)
const revokeMemberForm = ref({
  amount: ''
})

const ledgerDrawerOpen = ref(false)
const ledgerLoading = ref(false)
const ledgerItems = ref([])
const ledgerPagination = ref({ page: 1, pageSize: 20, total: 0 })
const ledgerFilters = ref({
  userId: '',
  type: ''
})

const selectedTeam = computed(() => teams.value.find((team) => team.id === selectedTeamId.value) || null)
const hasTeams = computed(() => teams.value.length > 0)
const isForbidden = computed(() => errorState.value === 'forbidden' || errorState.value === 'unauthorized' || errorState.value === '403')

const selectedPolicy = computed({
  get() {
    return selectedTeam.value?.billingPolicy || 'legacy'
  },
  set(policy) {
    if (selectedTeam.value) selectedTeam.value.billingPolicy = policy
  }
})

const overview = computed(() => ({
  allocated: selectedTeam.value?.allocated_points || 0,
  remaining: selectedTeam.value?.active_remaining_points || 0,
  consumed: selectedTeam.value?.consumed_points || 0,
  expiringSoon: selectedTeam.value?.expiring_soon_points || 0,
  memberCount: selectedTeam.value?.member_count || members.value.length
}))

function formatPoints(value) {
  const number = Number(value) || 0
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function formatDate(value) {
  const timestamp = Number(value) || 0
  if (!timestamp) return '长期有效'
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

function formatLedgerType(type) {
  const labels = {
    allocate: '分配',
    consume: '消费',
    revoke: '收回',
    expire: '到期',
    refund: '退款'
  }
  return labels[type] || type || '-'
}

function getErrorCode(error) {
  return error?.body?.error || error?.message || ''
}

function showStatus(message) {
  statusMessage.value = message
  window.setTimeout(() => {
    if (statusMessage.value === message) statusMessage.value = ''
  }, 2400)
}

async function loadTeams() {
  loading.value = true
  errorState.value = ''
  try {
    const data = await getGroupTeams()
    teams.value = data.teams || []
    if (!selectedTeamId.value || !teams.value.some((team) => team.id === selectedTeamId.value)) {
      selectedTeamId.value = teams.value[0]?.id || ''
    }
    if (selectedTeamId.value) await loadMembers()
  } catch (error) {
    const code = getErrorCode(error)
    errorState.value = error.status === 403 ? '403' : (code || 'load_failed')
    teams.value = []
    members.value = []
  } finally {
    loading.value = false
  }
}

async function loadMembers() {
  if (!selectedTeamId.value) {
    members.value = []
    return
  }
  membersLoading.value = true
  try {
    const data = await getGroupTeamMembers(selectedTeamId.value)
    members.value = data.members || []
  } catch (error) {
    const code = getErrorCode(error)
    errorState.value = error.status === 403 ? '403' : (code || 'members_failed')
    members.value = []
  } finally {
    membersLoading.value = false
  }
}

async function selectTeam(teamId) {
  selectedTeamId.value = teamId
  ledgerItems.value = []
  ledgerDrawerOpen.value = false
  await loadMembers()
}

async function savePolicy(policy) {
  if (!selectedTeam.value || savingPolicy.value) return
  const team = selectedTeam.value
  const previousPolicy = team.billingPolicy || 'legacy'
  team.billingPolicy = policy
  savingPolicy.value = true
  try {
    const data = await updateGroupBillingPolicy(team.id, policy)
    team.billingPolicy = data.billingPolicy || policy
    showStatus('策略已保存')
  } catch (error) {
    team.billingPolicy = previousPolicy
    showStatus(error.message || '策略保存失败')
  } finally {
    savingPolicy.value = false
  }
}

function openAllocation(member) {
  allocationTarget.value = member
  allocationForm.value = {
    amount: '',
    expiresMode: 'none',
    customDate: ''
  }
  showAllocationModal.value = true
}

function closeAllocation() {
  showAllocationModal.value = false
  allocationTarget.value = null
}

function resolveExpiresAt() {
  const mode = allocationForm.value.expiresMode
  if (mode === 'none') return 0
  if (mode === '7d') return Date.now() + 7 * 24 * 60 * 60 * 1000
  if (mode === '30d') return Date.now() + 30 * 24 * 60 * 60 * 1000
  if (mode === 'custom' && allocationForm.value.customDate) {
    const date = new Date(`${allocationForm.value.customDate}T23:59:59`)
    const timestamp = date.getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }
  return 0
}

async function submitAllocation() {
  if (!selectedTeam.value || !allocationTarget.value || allocationSubmitting.value) return
  const amount = Number(allocationForm.value.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    showStatus('请输入有效积分')
    return
  }
  allocationSubmitting.value = true
  try {
    await allocateGroupCredits(selectedTeam.value.id, {
      userId: allocationTarget.value.user_id,
      amount,
      expiresAt: resolveExpiresAt()
    })
    closeAllocation()
    await Promise.all([loadTeams(), loadMembers()])
    showStatus('积分已分配')
  } catch (error) {
    showStatus(error.message || '分配失败')
  } finally {
    allocationSubmitting.value = false
  }
}

function openRevokeMemberCredits(member) {
  revokeMemberTarget.value = member
  revokeMemberForm.value = {
    amount: ''
  }
  showRevokeMemberModal.value = true
}

function closeRevokeMemberCredits() {
  if (revokeMemberSubmitting.value) return
  showRevokeMemberModal.value = false
  revokeMemberTarget.value = null
}

async function submitRevokeMemberCredits() {
  if (!selectedTeam.value || !revokeMemberTarget.value || revokeMemberSubmitting.value) return
  const amount = Number(revokeMemberForm.value.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    showStatus('请输入有效积分')
    return
  }
  if (amount > Number(revokeMemberTarget.value.active_remaining_points || 0)) {
    showStatus('收回积分不能超过成员剩余积分')
    return
  }
  revokeMemberSubmitting.value = true
  try {
    await revokeGroupMemberCredits(selectedTeam.value.id, revokeMemberTarget.value.user_id, amount)
    showRevokeMemberModal.value = false
    revokeMemberTarget.value = null
    await Promise.all([loadTeams(), loadMembers()])
    showStatus('未使用积分已收回')
  } catch (error) {
    showStatus(error.message || '收回失败')
  } finally {
    revokeMemberSubmitting.value = false
  }
}

async function revokeMember(member) {
  if (!selectedTeam.value) return
  const confirmed = window.confirm(`收回 ${member.username || member.email || member.user_id} 的全部未使用团队积分？`)
  if (!confirmed) return
  try {
    await revokeAllGroupMemberCredits(selectedTeam.value.id, member.user_id)
    await Promise.all([loadTeams(), loadMembers()])
    showStatus('成员未使用积分已收回')
  } catch (error) {
    showStatus(error.message || '收回失败')
  }
}

async function openLedger(member = null) {
  if (!selectedTeam.value) return
  ledgerFilters.value.userId = member?.user_id || ''
  ledgerPagination.value.page = 1
  ledgerDrawerOpen.value = true
  await loadLedger()
}

function closeLedgerDrawer() {
  ledgerDrawerOpen.value = false
}

async function loadLedger(page = ledgerPagination.value.page) {
  if (!selectedTeam.value) return
  ledgerLoading.value = true
  try {
    const data = await getGroupLedger(selectedTeam.value.id, {
      page,
      pageSize: ledgerPagination.value.pageSize,
      userId: ledgerFilters.value.userId,
      type: ledgerFilters.value.type
    })
    ledgerItems.value = data.items || []
    ledgerPagination.value = {
      ...ledgerPagination.value,
      ...(data.pagination || {}),
      page
    }
  } catch (error) {
    showStatus(error.message || '流水加载失败')
  } finally {
    ledgerLoading.value = false
  }
}

onMounted(loadTeams)
</script>

<template>
  <main class="min-h-screen bg-slate-50 text-slate-900 dark:bg-dark-900 dark:text-slate-100">
    <div class="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header class="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-dark-600 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="text-2xl font-semibold">团队积分</h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">管理团队空间内可用的分配积分和计费顺序</p>
        </div>
        <button
          type="button"
          class="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-white dark:border-dark-600 dark:hover:bg-dark-700"
          @click="router.push('/canvas')"
        >
          返回画布
        </button>
      </header>

      <div v-if="statusMessage" class="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-dark-600 dark:bg-dark-800">
        {{ statusMessage }}
      </div>

      <section v-if="loading" class="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-dark-600 dark:bg-dark-800">
        正在加载团队积分数据
      </section>

      <section v-else-if="isForbidden" class="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-dark-600 dark:bg-dark-800">
        <h2 class="text-lg font-semibold">无权访问团队积分管理</h2>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">只有团队 owner 或租户管理员可以管理团队积分。</p>
      </section>

      <section v-else-if="!hasTeams" class="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-dark-600 dark:bg-dark-800">
        <h2 class="text-lg font-semibold">没有可管理的团队</h2>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">当前账号没有 owned 团队，也不是租户管理员。</p>
      </section>

      <template v-else>
        <section class="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside class="rounded-lg border border-slate-200 bg-white p-3 dark:border-dark-600 dark:bg-dark-800">
            <div class="mb-3 text-xs font-semibold uppercase text-slate-500">团队</div>
            <div class="space-y-2">
              <button
                v-for="team in teams"
                :key="team.id"
                type="button"
                class="w-full rounded-md border px-3 py-2 text-left text-sm transition"
                :class="team.id === selectedTeamId ? 'border-primary-400 bg-primary-50 text-primary-800 dark:bg-primary-900/20 dark:text-primary-200' : 'border-slate-200 hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700'"
                @click="selectTeam(team.id)"
              >
                <span class="block truncate font-medium">{{ team.name }}</span>
                <span class="mt-1 block text-xs text-slate-500">{{ team.member_count }} 人 · 剩余 {{ formatPoints(team.active_remaining_points) }}</span>
              </button>
            </div>
          </aside>

          <div class="space-y-4">
            <section class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 class="text-lg font-semibold">{{ selectedTeam?.name }}</h2>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ selectedTeam?.description || '团队空间积分策略' }}</p>
                </div>
                <div class="grid gap-2 sm:grid-cols-3">
                  <button
                    v-for="policy in billingPolicies"
                    :key="policy.value"
                    type="button"
                    class="min-h-16 rounded-md border px-3 py-2 text-left text-sm transition"
                    :class="selectedPolicy === policy.value ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-900/20 dark:text-primary-200' : 'border-slate-200 hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700'"
                    :disabled="savingPolicy"
                    @click="savePolicy(policy.value)"
                  >
                    <span class="block font-medium">{{ policy.label }}</span>
                    <span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">{{ policy.note }}</span>
                  </button>
                </div>
              </div>
            </section>

            <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">成员</div>
                <div class="mt-2 text-xl font-semibold">{{ overview.memberCount }}</div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">累计分配</div>
                <div class="mt-2 text-xl font-semibold">{{ formatPoints(overview.allocated) }}</div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">当前剩余</div>
                <div class="mt-2 text-xl font-semibold">{{ formatPoints(overview.remaining) }}</div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">已消费</div>
                <div class="mt-2 text-xl font-semibold">{{ formatPoints(overview.consumed) }}</div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">7天内到期</div>
                <div class="mt-2 text-xl font-semibold">{{ formatPoints(overview.expiringSoon) }}</div>
              </div>
            </section>

            <section class="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-dark-600 dark:bg-dark-800">
              <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-dark-600">
                <h3 class="text-base font-semibold">成员积分</h3>
                <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="openLedger()">
                  查看团队流水
                </button>
              </div>
              <div v-if="membersLoading" class="p-6 text-center text-sm text-slate-500">正在加载成员</div>
              <div v-else class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-dark-600">
                  <thead class="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-dark-700">
                    <tr>
                      <th class="px-4 py-3 text-left">成员</th>
                      <th class="px-4 py-3 text-left">角色</th>
                      <th class="px-4 py-3 text-right">累计分配</th>
                      <th class="px-4 py-3 text-right">剩余</th>
                      <th class="px-4 py-3 text-right">已消费</th>
                      <th class="px-4 py-3 text-left">最近到期</th>
                      <th class="px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-dark-700">
                    <tr v-for="member in members" :key="member.user_id">
                      <td class="px-4 py-3">
                        <div class="font-medium">{{ member.nickname || member.username || member.email || member.user_id }}</div>
                        <div class="text-xs text-slate-500">{{ member.email }}</div>
                      </td>
                      <td class="px-4 py-3">{{ member.role }}</td>
                      <td class="px-4 py-3 text-right">{{ formatPoints(member.allocated_points) }}</td>
                      <td class="px-4 py-3 text-right font-medium">{{ formatPoints(member.active_remaining_points) }}</td>
                      <td class="px-4 py-3 text-right">{{ formatPoints(member.consumed_points) }}</td>
                      <td class="px-4 py-3">{{ formatDate(member.nearest_expires_at) }}</td>
                      <td class="px-4 py-3">
                        <div class="flex justify-end gap-2">
                          <button type="button" class="rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700" @click="openAllocation(member)">分配</button>
                          <button type="button" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="openLedger(member)">流水</button>
                          <button type="button" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="openRevokeMemberCredits(member)">部分收回</button>
                          <button type="button" class="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20" @click="revokeMember(member)">全部收回</button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="members.length === 0">
                      <td colspan="7" class="px-4 py-8 text-center text-slate-500">暂无成员</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </template>
    </div>

    <div v-if="showAllocationModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <section class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-dark-800">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-lg font-semibold">分配团队积分</h3>
            <p class="mt-1 text-sm text-slate-500">{{ allocationTarget?.username || allocationTarget?.email || allocationTarget?.user_id }}</p>
          </div>
          <button type="button" class="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-700" @click="closeAllocation">✕</button>
        </div>
        <div class="mt-4 space-y-4">
          <label class="block">
            <span class="text-sm font-medium">积分数量</span>
            <input v-model="allocationForm.amount" type="number" min="0" step="1" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-900" />
          </label>
          <label class="block">
            <span class="text-sm font-medium">有效期</span>
            <select v-model="allocationForm.expiresMode" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-900">
              <option value="none">长期有效</option>
              <option value="7d">7 天</option>
              <option value="30d">30 天</option>
              <option value="custom">自定义日期</option>
            </select>
          </label>
          <label v-if="allocationForm.expiresMode === 'custom'" class="block">
            <span class="text-sm font-medium">到期日期</span>
            <input v-model="allocationForm.customDate" type="date" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-900" />
          </label>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="closeAllocation">取消</button>
          <button type="button" class="rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60" :disabled="allocationSubmitting" @click="submitAllocation">确认分配</button>
        </div>
      </section>
    </div>

    <div v-if="showRevokeMemberModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <section class="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-dark-800">
        <div class="border-b border-slate-200 px-5 py-4 dark:border-dark-600">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold">部分收回积分</h3>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ revokeMemberTarget?.nickname || revokeMemberTarget?.username || revokeMemberTarget?.email || revokeMemberTarget?.user_id }}</p>
            </div>
            <button type="button" class="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-dark-700" :disabled="revokeMemberSubmitting" @click="closeRevokeMemberCredits">✕</button>
          </div>
        </div>
        <div class="px-5 py-4">
          <div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-100">
            从该成员当前剩余团队积分中收回指定数量，优先收回最近到期的未使用积分。
          </div>
          <label class="mt-4 block">
            <span class="text-sm font-medium">收回积分数量</span>
            <input
              v-model="revokeMemberForm.amount"
              type="number"
              min="0"
              step="1"
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-900"
              :max="revokeMemberTarget?.active_remaining_points || 0"
              placeholder="输入要收回的积分"
              @keyup.enter="submitRevokeMemberCredits"
            />
            <span class="mt-1 block text-xs text-slate-500">当前可收回：{{ formatPoints(revokeMemberTarget?.active_remaining_points || 0) }}</span>
          </label>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-dark-600">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-dark-600 dark:hover:bg-dark-700" :disabled="revokeMemberSubmitting" @click="closeRevokeMemberCredits">取消</button>
          <button
            type="button"
            class="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            :disabled="revokeMemberSubmitting || !(Number(revokeMemberForm.amount) > 0)"
            @click="submitRevokeMemberCredits"
          >
            {{ revokeMemberSubmitting ? '收回中' : '确认收回' }}
          </button>
        </div>
      </section>
    </div>

    <aside v-if="ledgerDrawerOpen" class="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-dark-600 dark:bg-dark-800">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-dark-600">
        <h3 class="text-lg font-semibold">团队积分流水</h3>
      </div>
      <div class="flex gap-2 border-b border-slate-200 px-4 py-3 dark:border-dark-600">
        <select v-model="ledgerFilters.type" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-dark-600 dark:bg-dark-900" @change="loadLedger(1)">
          <option value="">全部类型</option>
          <option value="allocate">分配</option>
          <option value="consume">消费</option>
          <option value="revoke">收回</option>
          <option value="expire">到期</option>
          <option value="refund">退款</option>
        </select>
        <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="loadLedger(1)">刷新</button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-if="ledgerLoading" class="p-6 text-center text-sm text-slate-500">正在加载流水</div>
        <div v-else-if="ledgerItems.length === 0" class="p-6 text-center text-sm text-slate-500">暂无流水</div>
        <div v-else class="divide-y divide-slate-100 dark:divide-dark-700">
          <div v-for="item in ledgerItems" :key="item.ledger_id" class="px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-medium">{{ formatLedgerType(item.type) }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ item.memo || item.task_id || item.allocation_id }}</div>
              </div>
              <div class="text-right">
                <div class="text-sm font-semibold" :class="item.value >= 0 ? 'text-green-600' : 'text-red-600'">{{ item.value >= 0 ? '+' : '' }}{{ formatPoints(item.value) }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ formatDate(item.created_at) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-dark-600">
        <div class="flex items-center gap-3">
          <span>共 {{ ledgerPagination.total }} 条</span>
          <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-dark-600 dark:text-slate-300 dark:hover:bg-dark-700" @click="closeLedgerDrawer">
            收起
          </button>
        </div>
        <div class="flex gap-2">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-dark-600" :disabled="ledgerPagination.page <= 1" @click="loadLedger(ledgerPagination.page - 1)">上一页</button>
          <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-dark-600" :disabled="ledgerPagination.page * ledgerPagination.pageSize >= ledgerPagination.total" @click="loadLedger(ledgerPagination.page + 1)">下一页</button>
        </div>
      </div>
    </aside>
  </main>
</template>

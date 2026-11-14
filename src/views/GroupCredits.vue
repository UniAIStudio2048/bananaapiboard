<script setup>
import { t as translateUi, currentLanguage as uiLanguage } from '@/i18n'

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
const canAllocate = ref(false)
onMounted(async () => {
  const { getMe } = await import('@/api/client')
  const user = await getMe(true)
  canAllocate.value = Boolean(user && !user.is_subuser)
})

const billingPolicies = [
  { value: 'legacy', get label() { return translateUi('uiMessages.m003f3ed70f09') }, get note() { return translateUi('uiMessages.m517696d7f699') } },
  { value: 'team_only', get label() { return translateUi('uiMessages.maccc17fb3dde') }, get note() { return translateUi('uiMessages.m27658491229d') } },
  { value: 'team_first', get label() { return translateUi('uiMessages.md7310f75b1e3') }, get note() { return translateUi('uiMessages.m35760fab01ea') } }
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
  return number.toLocaleString(uiLanguage.value, { maximumFractionDigits: 2 })
}

function formatDate(value) {
  const timestamp = Number(value) || 0
  if (!timestamp) return translateUi('uiMessages.m824fe235445d')
  return new Date(timestamp).toLocaleDateString(uiLanguage.value)
}

function formatLedgerType(type) {
  const labels = {
    allocate: translateUi('uiMessages.mfc135337a267'),
    consume: translateUi('uiMessages.m80716311485a'),
    revoke: translateUi('uiMessages.m6923cef57f25'),
    expire: translateUi('uiMessages.m1f29b74ad60c'),
    refund: translateUi('pointsType.refund')
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
    showStatus(translateUi('uiMessages.mbe1274dfeb57'))
  } catch (error) {
    team.billingPolicy = previousPolicy
    showStatus(error.message || translateUi('uiMessages.mef937e252d2e'))
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
    showStatus(translateUi('uiMessages.mefcfc2916e5f'))
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
    showStatus(translateUi('uiMessages.me210d238ec9b'))
  } catch (error) {
    showStatus(error.message || translateUi('uiMessages.mdfb321848f1c'))
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
    showStatus(translateUi('uiMessages.mefcfc2916e5f'))
    return
  }
  if (amount > Number(revokeMemberTarget.value.active_remaining_points || 0)) {
    showStatus(translateUi('uiMessages.me8d97001b258'))
    return
  }
  revokeMemberSubmitting.value = true
  try {
    await revokeGroupMemberCredits(selectedTeam.value.id, revokeMemberTarget.value.user_id, amount)
    showRevokeMemberModal.value = false
    revokeMemberTarget.value = null
    await Promise.all([loadTeams(), loadMembers()])
    showStatus(translateUi('uiMessages.m893133ad5842'))
  } catch (error) {
    showStatus(error.message || translateUi('uiMessages.me96f76828f4d'))
  } finally {
    revokeMemberSubmitting.value = false
  }
}

async function revokeMember(member) {
  if (!selectedTeam.value) return
  const confirmed = window.confirm(translateUi('uiMessages.mdf8155ae22d3', { value1: (member.username || member.email || member.user_id) }))
  if (!confirmed) return
  try {
    await revokeAllGroupMemberCredits(selectedTeam.value.id, member.user_id)
    await Promise.all([loadTeams(), loadMembers()])
    showStatus(translateUi('uiMessages.m51c356194c26'))
  } catch (error) {
    showStatus(error.message || translateUi('uiMessages.me96f76828f4d'))
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
    showStatus(error.message || translateUi('uiMessages.mbedba71a20ad'))
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
          <h1 class="text-2xl font-semibold">{{ translateUi('user.teamPoints') }}</h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m661a6f11a79a') }}</p>
        </div>
        <button
          type="button"
          class="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-white dark:border-dark-600 dark:hover:bg-dark-700"
          @click="router.push('/canvas')"
        >
          {{ translateUi('uiMessages.mbeef286e1e42') }}
        </button>
      </header>

      <div v-if="statusMessage" class="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-dark-600 dark:bg-dark-800">
        {{ statusMessage }}
      </div>

      <section v-if="loading" class="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-dark-600 dark:bg-dark-800">
        {{ translateUi('uiMessages.ma47c119f349c') }}
      </section>

      <section v-else-if="isForbidden" class="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-dark-600 dark:bg-dark-800">
        <h2 class="text-lg font-semibold">{{ translateUi('uiMessages.m8cc1c4d963f0') }}</h2>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m2921b58fb296') }}</p>
      </section>

      <section v-else-if="!hasTeams" class="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-dark-600 dark:bg-dark-800">
        <h2 class="text-lg font-semibold">{{ translateUi('uiMessages.m84c36cf25920') }}</h2>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.mdcfcb0ddf99b') }}</p>
      </section>

      <template v-else>
        <section class="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside class="rounded-lg border border-slate-200 bg-white p-3 dark:border-dark-600 dark:bg-dark-800">
            <div class="mb-3 text-xs font-semibold uppercase text-slate-500">{{ translateUi('uiMessages.macdf17f4e9c4') }}</div>
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
                <span class="mt-1 block text-xs text-slate-500">{{ translateUi('uiMessages.m0077741cb590', { value1: (team.member_count), value2: (formatPoints(team.active_remaining_points)) }) }}</span>
              </button>
            </div>
          </aside>

          <div class="space-y-4">
            <section class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 class="text-lg font-semibold">{{ selectedTeam?.name }}</h2>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ selectedTeam?.description || translateUi('uiMessages.me922d28640a3') }}</p>
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
                <div class="text-xs text-slate-500">{{ translateUi('uiMessages.m6e6d6ddbb7c1') }}</div>
                <div class="mt-2 text-xl font-semibold">{{ overview.memberCount }}</div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">{{ translateUi('uiMessages.m260a6961897e') }}</div>
                <div class="mt-2 text-xl font-semibold">{{ formatPoints(overview.allocated) }}</div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">{{ translateUi('uiMessages.ma322d67a4dcd') }}</div>
                <div class="mt-2 text-xl font-semibold">{{ formatPoints(overview.remaining) }}</div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">{{ translateUi('uiMessages.mea602044bfa6') }}</div>
                <div class="mt-2 text-xl font-semibold">{{ formatPoints(overview.consumed) }}</div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800">
                <div class="text-xs text-slate-500">{{ translateUi('uiMessages.m0d1949e16769') }}</div>
                <div class="mt-2 text-xl font-semibold">{{ formatPoints(overview.expiringSoon) }}</div>
              </div>
            </section>

            <section class="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-dark-600 dark:bg-dark-800">
              <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-dark-600">
                <h3 class="text-base font-semibold">{{ translateUi('uiMessages.med30e88d3051') }}</h3>
                <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="openLedger()">
                  {{ translateUi('uiMessages.m9ef29c88d7e8') }}
                </button>
              </div>
              <div v-if="membersLoading" class="p-6 text-center text-sm text-slate-500">{{ translateUi('uiMessages.m50f55dbef720') }}</div>
              <div v-else class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-dark-600">
                  <thead class="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-dark-700">
                    <tr>
                      <th class="px-4 py-3 text-left">{{ translateUi('uiMessages.m6e6d6ddbb7c1') }}</th>
                      <th class="px-4 py-3 text-left">{{ translateUi('user.role') }}</th>
                      <th class="px-4 py-3 text-right">{{ translateUi('uiMessages.m260a6961897e') }}</th>
                      <th class="px-4 py-3 text-right">{{ translateUi('uiMessages.md6822b04178d') }}</th>
                      <th class="px-4 py-3 text-right">{{ translateUi('uiMessages.mea602044bfa6') }}</th>
                      <th class="px-4 py-3 text-left">{{ translateUi('uiMessages.m97f083027843') }}</th>
                      <th class="px-4 py-3 text-right">{{ translateUi('uiMessages.med31fbb483ee') }}</th>
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
                          <button v-if="canAllocate" type="button" class="rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700" @click="openAllocation(member)">{{ translateUi('uiMessages.mfc135337a267') }}</button>
                          <button type="button" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="openLedger(member)">{{ translateUi('uiMessages.m0fb688b74cfb') }}</button>
                          <button type="button" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="openRevokeMemberCredits(member)">{{ translateUi('uiMessages.m38c6ee8a0034') }}</button>
                          <button type="button" class="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20" @click="revokeMember(member)">{{ translateUi('uiMessages.m77d7b6fb827a') }}</button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="members.length === 0">
                      <td colspan="7" class="px-4 py-8 text-center text-slate-500">{{ translateUi('uiMessages.m51c54a24eb22') }}</td>
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
            <h3 class="text-lg font-semibold">{{ translateUi('uiMessages.m7904fd5b0d29') }}</h3>
            <p class="mt-1 text-sm text-slate-500">{{ allocationTarget?.username || allocationTarget?.email || allocationTarget?.user_id }}</p>
          </div>
          <button type="button" class="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-700" @click="closeAllocation">✕</button>
        </div>
        <div class="mt-4 space-y-4">
          <label class="block">
            <span class="text-sm font-medium">{{ translateUi('uiMessages.m5da54b27a36f') }}</span>
            <input v-model="allocationForm.amount" type="number" min="0" step="1" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-900" />
          </label>
          <label class="block">
            <span class="text-sm font-medium">{{ translateUi('uiMessages.m9c2a28e8f98f') }}</span>
            <select v-model="allocationForm.expiresMode" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-900">
              <option value="none">{{ translateUi('uiMessages.m824fe235445d') }}</option>
              <option value="7d">{{ translateUi('uiMessages.m38eefacbb326') }}</option>
              <option value="30d">{{ translateUi('uiMessages.m84ad2952a308') }}</option>
              <option value="custom">{{ translateUi('uiMessages.ma953fd81881f') }}</option>
            </select>
          </label>
          <label v-if="allocationForm.expiresMode === 'custom'" class="block">
            <span class="text-sm font-medium">{{ translateUi('uiMessages.m7589d263a38d') }}</span>
            <input v-model="allocationForm.customDate" type="date" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-900" />
          </label>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="closeAllocation">{{ translateUi('common.cancel') }}</button>
          <button type="button" class="rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60" :disabled="allocationSubmitting" @click="submitAllocation">{{ translateUi('uiMessages.m2dd50f9d7818') }}</button>
        </div>
      </section>
    </div>

    <div v-if="showRevokeMemberModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <section class="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-dark-800">
        <div class="border-b border-slate-200 px-5 py-4 dark:border-dark-600">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold">{{ translateUi('uiMessages.m54fa2e1046df') }}</h3>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ revokeMemberTarget?.nickname || revokeMemberTarget?.username || revokeMemberTarget?.email || revokeMemberTarget?.user_id }}</p>
            </div>
            <button type="button" class="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-dark-700" :disabled="revokeMemberSubmitting" @click="closeRevokeMemberCredits">✕</button>
          </div>
        </div>
        <div class="px-5 py-4">
          <div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-100">
            {{ translateUi('uiMessages.m6df9d27b8aa2') }}
          </div>
          <label class="mt-4 block">
            <span class="text-sm font-medium">{{ translateUi('uiMessages.me0f80fccbad6') }}</span>
            <input
              v-model="revokeMemberForm.amount"
              type="number"
              min="0"
              step="1"
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-900"
              :max="revokeMemberTarget?.active_remaining_points || 0"
              :placeholder="translateUi('uiMessages.m05e93a1aefe1')"
              @keyup.enter="submitRevokeMemberCredits"
            />
            <span class="mt-1 block text-xs text-slate-500">{{ translateUi('uiMessages.m6f3e052e50b2', { value1: (formatPoints(revokeMemberTarget?.active_remaining_points || 0)) }) }}</span>
          </label>
        </div>
        <div class="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-dark-600">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-dark-600 dark:hover:bg-dark-700" :disabled="revokeMemberSubmitting" @click="closeRevokeMemberCredits">{{ translateUi('common.cancel') }}</button>
          <button
            type="button"
            class="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            :disabled="revokeMemberSubmitting || !(Number(revokeMemberForm.amount) > 0)"
            @click="submitRevokeMemberCredits"
          >
            {{ revokeMemberSubmitting ? translateUi('uiMessages.m7851cbb5dbf8') : translateUi('uiMessages.m1da18451fd9d') }}
          </button>
        </div>
      </section>
    </div>

    <aside v-if="ledgerDrawerOpen" class="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-dark-600 dark:bg-dark-800">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-dark-600">
        <h3 class="text-lg font-semibold">{{ translateUi('uiMessages.mf29f83b86aeb') }}</h3>
      </div>
      <div class="flex gap-2 border-b border-slate-200 px-4 py-3 dark:border-dark-600">
        <select v-model="ledgerFilters.type" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-dark-600 dark:bg-dark-900" @change="loadLedger(1)">
          <option value="">{{ translateUi('uiMessages.m267c4a7a86dd') }}</option>
          <option value="allocate">{{ translateUi('uiMessages.mfc135337a267') }}</option>
          <option value="consume">{{ translateUi('uiMessages.m80716311485a') }}</option>
          <option value="revoke">{{ translateUi('uiMessages.m6923cef57f25') }}</option>
          <option value="expire">{{ translateUi('uiMessages.m1f29b74ad60c') }}</option>
          <option value="refund">{{ translateUi('user.ledgerType.refund') }}</option>
        </select>
        <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-dark-600 dark:hover:bg-dark-700" @click="loadLedger(1)">{{ translateUi('common.refresh') }}</button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-if="ledgerLoading" class="p-6 text-center text-sm text-slate-500">{{ translateUi('uiMessages.m631f1fc6bf92') }}</div>
        <div v-else-if="ledgerItems.length === 0" class="p-6 text-center text-sm text-slate-500">{{ translateUi('uiMessages.m23e23d94a7d8') }}</div>
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
          <span>{{ translateUi('uiMessages.m85ad0e047775', { value1: (ledgerPagination.total) }) }}</span>
          <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-dark-600 dark:text-slate-300 dark:hover:bg-dark-700" @click="closeLedgerDrawer">
            {{ translateUi('common.less') }}
          </button>
        </div>
        <div class="flex gap-2">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-dark-600" :disabled="ledgerPagination.page <= 1" @click="loadLedger(ledgerPagination.page - 1)">{{ translateUi('uiMessages.mc9b9ae7a6144') }}</button>
          <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-dark-600" :disabled="ledgerPagination.page * ledgerPagination.pageSize >= ledgerPagination.total" @click="loadLedger(ledgerPagination.page + 1)">{{ translateUi('uiMessages.m8a8542f69648') }}</button>
        </div>
      </div>
    </aside>
  </main>
</template>

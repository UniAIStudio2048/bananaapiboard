<script setup>
import { t as translateUi } from '@/i18n'

/**
 * ForkDialog.vue - 复刻工作流到个人/团队空间
 */
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { forkWork } from '@/api/community'
import { useTeamStore } from '@/stores/team'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  workId: { type: Number, default: 0 },
  workTitle: { type: String, default: '' },
  cloneFn: { type: Function, default: null },
  hasProject: { type: Boolean, default: false },
  projectName: { type: String, default: '' },
  projectWorkflowCount: { type: Number, default: 0 },
  defaultScope: { type: String, default: 'workflow' }
})

const emit = defineEmits(['update:modelValue', 'forked'])

const router = useRouter()
const teamStore = useTeamStore()

const spaceType = ref('personal')
const selectedTeamId = ref(null)
const forkScope = ref('workflow')
const loading = ref(false)
const error = ref('')
const success = ref(false)
const forkedWorkflowId = ref(null)
const teamsLoading = ref(false)

const myTeams = computed(() => teamStore.myTeams.value || [])

async function loadTeams() {
  teamsLoading.value = true
  try {
    await teamStore.loadMyTeams()
  } finally {
    teamsLoading.value = false
  }
}

watch(() => props.modelValue, (v) => {
  if (v) {
    spaceType.value = 'personal'
    selectedTeamId.value = null
    forkScope.value = props.defaultScope === 'project' ? 'project' : 'workflow'
    error.value = ''
    success.value = false
    forkedWorkflowId.value = null
    loadTeams()
  }
})

function close() {
  emit('update:modelValue', false)
}

async function handleFork() {
  if (spaceType.value === 'team' && !selectedTeamId.value) {
    error.value = translateUi('uiMessages.md759185a7e0f')
    return
  }

  loading.value = true
  error.value = ''
  try {
    const data = {
      space_type: spaceType.value,
      ...(spaceType.value === 'team' ? { team_id: selectedTeamId.value } : {}),
      ...(forkScope.value === 'project' ? { scope: 'project' } : {})
    }
    // If custom clone function provided, use it; otherwise use default forkWork
    const result = props.cloneFn
      ? await props.cloneFn({
        space_type: spaceType.value,
        ...(spaceType.value === 'team' ? { team_id: selectedTeamId.value } : {}),
        ...(forkScope.value === 'project' ? { scope: 'project' } : {})
      })
      : await forkWork(props.workId, data)
    success.value = true
    forkedWorkflowId.value = result.data?.workflow_id || result.workflow_id || result.workflowId || null
    emit('forked', result)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.mc2cfe34c64af')
  } finally {
    loading.value = false
  }
}

function goToWorkflow() {
  close()
  if (forkedWorkflowId.value) {
    router.push({ name: 'canvas', query: { load: forkedWorkflowId.value } })
  } else {
    router.push({ name: 'canvas' })
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[9999] flex items-center justify-center"
      @click.self="close"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div class="relative w-full max-w-md mx-4 bg-gray-900 rounded-2xl border border-white/10 shadow-2xl animate-[slideUp_0.3s_ease]">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 class="text-lg font-semibold text-white">{{ translateUi('uiMessages.m562ac822544c') }}</h2>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
            @click="close"
            :aria-label="translateUi('common.close')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="px-6 py-5">
          <!-- 成功状态 -->
          <div v-if="success" class="text-center py-4">
            <div class="w-14 h-14 mx-auto mb-4 bg-green-500/10 rounded-full flex items-center justify-center">
              <svg class="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <p class="text-white font-medium mb-1">{{ forkScope === 'project' ? translateUi('uiMessages.m35899b2417a5') : translateUi('uiMessages.m413bc2afe3a8') }}</p>
            <p class="text-sm text-white/50 mb-5">{{ t('team.forkedToSpace', { type: forkScope === 'project' ? t('team.projectAndWorkflows') : t('team.workflow'), space: spaceType === 'team' ? t('team.teamSpace') : t('team.personalSpace') }) }}</p>
            <div class="flex gap-3 justify-center">
              <button
                class="px-4 py-2 bg-white/10 text-white/80 text-sm rounded-lg hover:bg-white/15 transition"
                @click="close"
              >{{ translateUi('common.close') }}</button>
              <button
                class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition"
                @click="goToWorkflow"
              >{{ translateUi('canvas.openWorkflow') }}</button>
            </div>
          </div>

          <!-- 选择表单 -->
          <div v-else>
            <p class="text-sm text-white/60 mb-4">
              {{ translateUi('uiMessages.m8bab3d560f58', { value1: (workTitle) }) }}
            </p>

            <!-- 复刻范围（仅关联项目的作品显示） -->
            <div v-if="hasProject" class="mb-5">
              <p class="text-sm text-white/70 mb-2">{{ translateUi('uiMessages.m0e0d08f5913c') }}</p>
              <div class="space-y-2">
                <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition"
                  :class="forkScope === 'workflow' ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-white/20'">
                  <input v-model="forkScope" type="radio" value="workflow" class="accent-blue-500" />
                  <div>
                    <p class="text-sm text-white font-medium">{{ translateUi('uiMessages.m51f62eb6cff0') }}</p>
                  </div>
                </label>
                <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition"
                  :class="forkScope === 'project' ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-white/20'">
                  <input v-model="forkScope" type="radio" value="project" class="accent-blue-500" />
                  <div>
                    <p class="text-sm text-white font-medium">{{ translateUi('uiMessages.m7e3ac19bc989') }}</p>
                    <p class="text-xs text-white/40">{{ translateUi('uiMessages.m5f5c9a47ec8a', { value1: (projectName), value2: (projectWorkflowCount) }) }}</p>
                  </div>
                </label>
              </div>
            </div>

            <!-- 空间选择 -->
            <div class="space-y-3 mb-5">
              <label
                class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition"
                :class="spaceType === 'personal' ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-white/20'"
              >
                <input v-model="spaceType" type="radio" value="personal" class="accent-blue-500" />
                <div>
                  <p class="text-sm text-white font-medium">{{ t('team.personalSpace') }}</p>
                  <p class="text-xs text-white/40">{{ t('team.saveToPersonal') }}</p>
                </div>
              </label>

              <label
                class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition"
                :class="spaceType === 'team' ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-white/20'"
              >
                <input v-model="spaceType" type="radio" value="team" class="accent-blue-500" />
                <div>
                  <p class="text-sm text-white font-medium">{{ t('team.teamSpace') }}</p>
                  <p class="text-xs text-white/40">{{ t('team.saveToTeam') }}</p>
                </div>
              </label>
            </div>

            <!-- 团队选择 -->
            <div v-if="spaceType === 'team'" class="mb-5">
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('uiMessages.me0a7a7c7745c') }}</label>
              <p v-if="teamsLoading" class="text-xs text-white/40 py-2">{{ translateUi('common.loading') }}</p>
              <template v-else>
                <select
                  v-if="myTeams.length > 0"
                  v-model="selectedTeamId"
                  class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50 transition"
                >
                  <option :value="null" disabled class="bg-gray-900">{{ translateUi('uiMessages.md759185a7e0f') }}</option>
                  <option
                    v-for="team in myTeams"
                    :key="team.id"
                    :value="team.id"
                    class="bg-gray-900"
                  >{{ team.name }}</option>
                </select>
                <p v-else class="text-xs text-white/40 mt-1">
                  {{ translateUi('uiMessages.m25551af11d0b') }}
                </p>
              </template>
            </div>

            <!-- 错误 -->
            <div v-if="error" class="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {{ error }}
            </div>

            <!-- 按钮 -->
            <div class="flex gap-3 justify-end">
              <button
                class="px-4 py-2 bg-white/10 text-white/80 text-sm rounded-lg hover:bg-white/15 transition"
                @click="close"
                :disabled="loading"
              >{{ translateUi('common.cancel') }}</button>
              <button
                class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                @click="handleFork"
                :disabled="loading"
              >
                <span v-if="loading" class="inline-flex items-center">
                  <svg class="animate-spin -ml-1 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                  {{ translateUi('uiMessages.m89826cec3284') }}
                </span>
                <span v-else>{{ translateUi('uiMessages.m50cd33c50b14') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

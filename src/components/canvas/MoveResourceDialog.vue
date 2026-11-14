<script setup>
import { t as translateUi } from '@/i18n'

import { computed, ref, watch } from 'vue'
import {
  getProjectList,
  copyProjectToSpace,
  copyWorkflowToSpace,
  transferProjectSpace,
  transferWorkflowSpace
} from '@/api/canvas/project'
import { useTeamStore } from '@/stores/team'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  resourceType: { type: String, default: 'workflow' },
  resourceId: { type: String, default: '' },
  resourceName: { type: String, default: '' },
  workflowCount: { type: Number, default: 0 },
  currentSpaceType: { type: String, default: 'personal' },
  currentTeamId: { type: String, default: '' },
  currentProjectId: { type: String, default: '' },
  spaceFilter: { type: String, default: 'personal' },
  sourceRole: { type: String, default: '' },
  isDefaultProject: { type: Boolean, default: false },
  operation: { type: String, default: 'move' }
})

const emit = defineEmits(['update:modelValue', 'moved'])
const teamStore = useTeamStore()
const targetSpaceId = ref('')
const selectedProjectId = ref('')
const projects = ref([])
const loading = ref(false)
const loadingProjects = ref(false)
const error = ref('')

const isProject = computed(() => props.resourceType === 'project')
const isCopy = computed(() => props.operation === 'copy')
const allSpaces = computed(() => teamStore.getAllSpaces())
const availableSpaces = computed(() => allSpaces.value.filter(space => {
  const isCurrent = space.type === props.currentSpaceType &&
    (space.type !== 'team' || String(space.teamId) === String(props.currentTeamId))
  if (isProject.value && isCurrent) return false
  if (props.currentSpaceType === 'team' && props.sourceRole === 'member') return isCurrent
  return true
}))
const selectedSpace = computed(() => allSpaces.value.find(space => space.id === targetSpaceId.value) || null)

watch(() => props.modelValue, async visible => {
  if (!visible) return
  error.value = ''
  selectedProjectId.value = ''
  await teamStore.loadMyTeams()
  const currentSpaceId = props.currentSpaceType === 'team' ? `team-${props.currentTeamId}` : 'personal'
  targetSpaceId.value = isProject.value
    ? (availableSpaces.value[0]?.id || '')
    : (availableSpaces.value.some(space => space.id === currentSpaceId) ? currentSpaceId : availableSpaces.value[0]?.id || '')
  await loadTargetProjects()
})

watch(targetSpaceId, () => {
  if (props.modelValue) loadTargetProjects()
})

async function loadTargetProjects() {
  projects.value = []
  selectedProjectId.value = ''
  if (isProject.value || !selectedSpace.value) return
  loadingProjects.value = true
  try {
    const space = selectedSpace.value
    const result = await getProjectList({ spaceType: space.type, teamId: space.teamId })
    projects.value = (result.data || []).filter(project => (
      isCopy.value || String(project.id) !== String(props.currentProjectId)
    ))
    const currentProject = isCopy.value
      ? projects.value.find(project => String(project.id) === String(props.currentProjectId))
      : null
    const defaultProject = projects.value.find(project => project.is_default)
    selectedProjectId.value = String(currentProject?.id || defaultProject?.id || projects.value[0]?.id || '')
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m13788f7879cf')
  } finally {
    loadingProjects.value = false
  }
}

function close() {
  if (!loading.value) emit('update:modelValue', false)
}

async function handleMove() {
  const space = selectedSpace.value
  if (!space) {
    error.value = translateUi('uiMessages.mef798a36ccbd')
    return
  }
  if (!isProject.value && !selectedProjectId.value) {
    error.value = translateUi('uiMessages.m42224de7e0fc')
    return
  }

  loading.value = true
  error.value = ''
  const payload = {
    targetSpaceType: space.type,
    targetTeamId: space.teamId || null
  }
  try {
    const result = isProject.value
      ? (isCopy.value
          ? await copyProjectToSpace(props.resourceId, payload)
          : await transferProjectSpace(props.resourceId, payload))
      : (isCopy.value
          ? await copyWorkflowToSpace(props.resourceId, { ...payload, targetProjectId: selectedProjectId.value })
          : await transferWorkflowSpace(props.resourceId, { ...payload, targetProjectId: selectedProjectId.value }))
    emit('moved', result)
    emit('update:modelValue', false)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m372bcad96156')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="fixed inset-0 z-[9999] flex items-center justify-center" @click.self="close">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div class="relative w-full max-w-lg mx-4 bg-gray-900 rounded-2xl border border-white/10 shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 class="text-lg font-semibold text-white">{{ isCopy ? translateUi('uiMessages.mcde2cd071d25') : translateUi('directorStudio.toolbar.move') }}{{ isProject ? translateUi('directorStudio.projects.title') : translateUi('canvas.workflow') }}</h2>
          <button class="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10" @click="close" :aria-label="translateUi('common.close')">×</button>
        </div>

        <div class="px-6 py-5 space-y-5">
          <div class="rounded-lg bg-white/5 p-3 text-sm text-white/70">
            <p class="font-medium text-white">{{ resourceName }}</p>
            <p v-if="isProject" class="mt-1 text-xs text-white/45">{{ translateUi('uiMessages.m81cb2470d25e', { value1: (workflowCount), value2: (isCopy ? translateUi('uiMessages.mf6825f1e73a1') : translateUi('uiMessages.m6b63520e4514')) }) }}</p>
            <p v-else class="mt-1 text-xs text-white/45">{{ translateUi('uiMessages.m36c79cfed847', { value1: (isCopy ? translateUi('uiMessages.m82571065635a') : '') }) }}</p>
          </div>

          <div>
            <label class="mb-2 block text-sm text-white/60">{{ translateUi('uiMessages.m6919eb274a2b') }}</label>
            <select v-model="targetSpaceId" class="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white">
              <option v-for="space in availableSpaces" :key="space.id" :value="space.id">
                {{ space.type === 'personal' ? translateUi('team.personalSpace') : space.name + translateUi('uiMessages.med0afef844c3') }}
              </option>
            </select>
            <p v-if="currentSpaceType === 'team' && sourceRole === 'member'" class="mt-2 text-xs text-amber-400">
              {{ translateUi('uiMessages.m17ae5fa272fa') }}
            </p>
          </div>

          <div v-if="!isProject">
            <label class="mb-2 block text-sm text-white/60">{{ translateUi('uiMessages.mb53d2ccbe6f0') }}</label>
            <div v-if="loadingProjects" class="py-5 text-center text-sm text-white/40">{{ translateUi('uiMessages.m39a57747baf6') }}</div>
            <select v-else v-model="selectedProjectId" class="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white">
              <option value="" disabled>{{ translateUi('uiMessages.m48211ee622b3') }}</option>
              <option v-for="project in projects" :key="project.id" :value="String(project.id)">
                {{ project.name }}{{ project.is_default ? translateUi('uiMessages.ma10f79ad92e6') : '' }}
              </option>
            </select>
          </div>

          <div v-if="isProject && isDefaultProject" class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            {{ translateUi('uiMessages.me11925c8b695') }}
          </div>
          <div v-if="error" class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{{ error }}</div>

          <div class="flex justify-end gap-3">
            <button class="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/15" :disabled="loading" @click="close">{{ translateUi('common.cancel') }}</button>
            <button
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="loading || isDefaultProject || !selectedSpace || (!isProject && (!selectedProjectId || loadingProjects))"
              @click="handleMove"
            >{{ loading ? (isCopy ? translateUi('uiMessages.m56b63def0e29') : translateUi('uiMessages.m13dccf109ec0')) : (isCopy ? translateUi('uiMessages.mf6825f1e73a1') : translateUi('uiMessages.m327bc633f3d2')) }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

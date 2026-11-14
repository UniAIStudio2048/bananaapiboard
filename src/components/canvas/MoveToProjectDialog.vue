<script setup>
import { t as translateUi } from '@/i18n'

/**
 * MoveToProjectDialog.vue - 移动工作流到指定项目
 */
import { ref, watch } from 'vue'
import { getProjectList, moveWorkflowToProject } from '@/api/canvas/project'
import { useTeamStore } from '@/stores/team'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  workflowId: { type: String, default: '' },
  workflowName: { type: String, default: '' },
  currentProjectId: { type: String, default: '' },
  spaceFilter: { type: String, default: 'personal' }
})

const emit = defineEmits(['update:modelValue', 'moved'])

const projects = ref([])
const selectedProjectId = ref('')
const loading = ref(false)
const loadingList = ref(false)
const error = ref('')
const teamStore = useTeamStore()

watch(() => props.modelValue, async (v) => {
  if (v) {
    error.value = ''
    selectedProjectId.value = ''
    loadingList.value = true
    try {
      const spaceParams = teamStore.getSpaceParams(props.spaceFilter)
      const result = await getProjectList({
        spaceType: spaceParams.spaceType,
        teamId: spaceParams.teamId
      })
      projects.value = (result.data || []).filter(p => String(p.id) !== String(props.currentProjectId))
    } catch (e) {
      error.value = translateUi('uiMessages.m5f9805973a16')
    } finally {
      loadingList.value = false
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

async function handleMove() {
  if (!selectedProjectId.value) {
    error.value = translateUi('uiMessages.m42224de7e0fc')
    return
  }
  loading.value = true
  error.value = ''
  try {
    await moveWorkflowToProject(props.workflowId, selectedProjectId.value)
    emit('moved')
    close()
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m372bcad96156')
  } finally {
    loading.value = false
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
          <h2 class="text-lg font-semibold text-white">{{ translateUi('uiMessages.m647eaf80ee94') }}</h2>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
            @click="close"
            :aria-label="translateUi('common.close')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="px-6 py-5">
          <p class="text-sm text-white/60 mb-4">
            {{ translateUi('uiMessages.m7d612c726099', { value1: (workflowName) }) }}
          </p>

          <!-- 加载中 -->
          <div v-if="loadingList" class="flex items-center justify-center py-8">
            <svg class="animate-spin h-6 w-6 text-white/40" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
          </div>

          <!-- 项目列表 -->
          <div v-else-if="projects.length > 0" class="space-y-2 mb-5 max-h-64 overflow-y-auto">
            <label
              v-for="project in projects"
              :key="project.id"
              class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition"
              :class="selectedProjectId === project.id ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-white/20'"
            >
              <input
                v-model="selectedProjectId"
                type="radio"
                :value="project.id"
                class="accent-blue-500"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm text-white font-medium truncate">
                  <span v-if="project.is_default" class="inline-block px-1.5 py-0.5 text-[10px] bg-white/10 text-white/60 rounded mr-1.5">{{ translateUi('uiMessages.m844b8cc8dff7') }}</span>
                  {{ project.name }}
                </p>
                <p class="text-xs text-white/40">{{ translateUi('uiMessages.m9882de3c01da', { value1: (project.workflow_count || 0) }) }}</p>
              </div>
            </label>
          </div>

          <!-- 空列表 -->
          <div v-else class="text-center py-8">
            <p class="text-sm text-white/40">{{ translateUi('uiMessages.mffaf60da0301') }}</p>
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
              @click="handleMove"
              :disabled="loading || projects.length === 0"
            >
              <span v-if="loading" class="inline-flex items-center">
                <svg class="animate-spin -ml-1 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                {{ translateUi('uiMessages.ma473adfb7349') }}
              </span>
              <span v-else>{{ translateUi('uiMessages.m327bc633f3d2') }}</span>
            </button>
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

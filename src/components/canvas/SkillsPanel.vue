<template>
  <div class="skills-panel-backdrop" @click.self="emit('close')">
    <section class="skills-panel canvas-panel" role="dialog" aria-modal="true" aria-labelledby="skills-panel-title">
      <header class="skills-panel-header">
        <div>
          <p class="skills-panel-kicker">{{ skillName }}</p>
          <h2 id="skills-panel-title">{{ translateUi('uiMessages.m39c6db66bcac') }}</h2>
        </div>
        <button class="skills-close-btn" type="button" :title="translateUi('common.close')" @click="emit('close')">
          <X :size="18" aria-hidden="true" />
        </button>
      </header>

      <div v-if="error" class="skills-alert">{{ error }}</div>

      <div class="skills-install-tabs" role="tablist" :aria-label="translateUi('uiMessages.m9c320cc7909f')">
        <button
          type="button"
          :class="{ active: installMode === 'agent' }"
          @click="installMode = 'agent'"
        >
          {{ translateUi('uiMessages.m71b52069f199') }}
        </button>
        <button
          type="button"
          :class="{ active: installMode === 'manual' }"
          @click="installMode = 'manual'"
        >
          {{ translateUi('uiMessages.mb7b8d7022794') }}
        </button>
      </div>

      <section v-if="installMode === 'agent'" class="skills-card skills-agent-install">
        <p class="skills-agent-copy">
          {{ translateUi('uiMessages.mf20a9439aa86') }}
        </p>
        <div class="skills-prompt-label">{{ translateUi('directorStudio.inspector.prompt') }}</div>
        <pre class="skills-prompt-box">{{ agentInstallPrompt }}</pre>
        <div class="skills-actions centered">
          <button class="btn-primary" type="button" :disabled="!agentInstallPrompt" @click="copyText(agentInstallPrompt, '安装提示词已复制')">{{ translateUi('uiMessages.m4a7752e23b18') }}</button>
        </div>
      </section>

      <section v-else class="skills-manual-grid">
        <div class="skills-field">
          <span>Base URL</span>
          <code>{{ baseUrl }}</code>
        </div>

        <div class="skills-card">
          <div class="skills-card-head">
            <div>
              <span class="skills-label">API Key</span>
              <strong>{{ activeKey?.key_prefix || translateUi('uiMessages.m90b310149a74') }}</strong>
            </div>
            <button class="skills-link-btn" type="button" :disabled="loading" @click="loadSkills">{{ translateUi('common.refresh') }}</button>
          </div>
          <div class="skills-key-row">
            <code>{{ visibleKey }}</code>
            <button class="skills-icon-btn" type="button" :disabled="!fullKey" @click="showKey = !showKey">
              {{ showKey ? translateUi('onboarding.settings.edgeStyleHidden') : translateUi('directorStudio.inspector.visible') }}
            </button>
          </div>
          <div class="skills-actions">
            <button class="btn-secondary" type="button" :disabled="!fullKey" @click="copyText(fullKey, 'API Key 已复制')">{{ translateUi('uiMessages.mdca92dff9f15') }}</button>
            <button class="btn-secondary" type="button" :disabled="!activeKey?.id || resetting" @click="confirmResetKey">{{ translateUi('uiMessages.mab38b115fae1') }}</button>
            <button class="btn-secondary" type="button" :disabled="loading" @click="ensureKey">{{ translateUi('uiMessages.mbad2e4ec0db2') }}</button>
          </div>
        </div>

        <div class="skills-card">
          <div class="skills-card-head">
            <div>
              <span class="skills-label">SKILL.md</span>
              <strong>{{ translateUi('uiMessages.ma3b703154298') }}</strong>
            </div>
            <RouterLink class="skills-docs-link" to="/docs" target="_blank">{{ translateUi('uiMessages.md1961d380a4d') }}</RouterLink>
          </div>
          <pre class="skills-markdown-preview">{{ markdownPreview }}</pre>
          <div class="skills-actions">
            <button class="btn-secondary" type="button" :disabled="!skillMarkdown" @click="copyText(skillMarkdown, 'SKILL.md 已复制')">{{ translateUi('uiMessages.ma068e0e4d2ae') }}</button>
            <button class="btn-secondary" type="button" :disabled="!packagePayload" @click="downloadPackage">{{ translateUi('uiMessages.m6ce7be0eefbd') }}</button>
          </div>
        </div>
      </section>

      <footer class="skills-panel-footer">
        <span>{{ statusMessage || translateUi('uiMessages.m296abb597806', { value1: (baseUrl) }) }}</span>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { X } from '@lucide/vue'
import { createSkillKey, getSkillKeys, getSkillPackage, resetSkillKey } from '@/api/skills'
import tenantConfig from '@/config/tenant'

const emit = defineEmits(['close'])

const loading = ref(false)
const resetting = ref(false)
const keys = ref([])
const packageData = ref(null)
const error = ref('')
const statusMessage = ref('')
const showKey = ref(false)
const installMode = ref('agent')
const baseUrl = ref(normalizeSkillBaseUrl(window.location.origin))

const activeKey = computed(() => keys.value.find(key => key.status === 'active') || keys.value[0] || null)
const fullKey = computed(() => activeKey.value?.api_key || packageData.value?.key?.api_key || '')
const visibleKey = computed(() => {
  if (!fullKey.value) return translateUi('uiMessages.me92b88c2e1c6')
  if (showKey.value) return fullKey.value
  const prefix = activeKey.value?.key_prefix || fullKey.value.slice(0, 16)
  return `${prefix}••••••••••••••••`
})
const skillMarkdown = computed(() => packageData.value?.markdown || '')
const markdownPreview = computed(() => skillMarkdown.value || translateUi('uiMessages.m81ca0a483f3e'))
const packagePayload = computed(() => packageData.value?.package || null)
const skillName = computed(() => packageData.value?.skillName || `${tenantConfig.brand?.name || 'Banana AI'} skill`)
const agentInstallPrompt = computed(() => (
  packageData.value?.agent_install_prompt ||
  packagePayload.value?.files?.['AGENT_INSTALL_PROMPT.txt'] ||
  `请帮我安装 ${skillName.value}：${baseUrl.value}。API Key 加载后会自动填入。`
))

function normalizeSkillBaseUrl(value) {
  const raw = String(value || '').trim()
  const candidate = raw.toLowerCase().startsWith('http://')
    ? raw.replace(/^http:\/\//i, 'https://')
    : raw.toLowerCase().startsWith('https://')
      ? raw
      : `https://${raw || window.location.host}`
  try {
    const url = new URL(candidate)
    return `https://${url.host}`
  } catch {
    return `https://${window.location.host}`
  }
}

function normalizeKeyResponse(data) {
  if (Array.isArray(data?.keys)) return data.keys
  if (Array.isArray(data?.data)) return data.data
  if (data?.key) return [data.key]
  return []
}

async function loadSkills() {
  loading.value = true
  error.value = ''
  try {
    const [keysResult, packageResult] = await Promise.all([
      getSkillKeys(),
      getSkillPackage().catch(() => null)
    ])
    keys.value = normalizeKeyResponse(keysResult)
    packageData.value = packageResult
    if (packageResult?.baseUrl) {
      baseUrl.value = normalizeSkillBaseUrl(packageResult.baseUrl)
    }
    if (!activeKey.value) {
      await ensureKey()
    }
  } catch (err) {
    error.value = err.message || translateUi('uiMessages.mae44567fe6ad')
  } finally {
    loading.value = false
  }
}

async function ensureKey() {
  if (activeKey.value?.api_key) return
  loading.value = true
  error.value = ''
  try {
    const result = await createSkillKey({ name: 'Canvas Skill' })
    keys.value = normalizeKeyResponse(result)
    if (!keys.value.length && result?.key) keys.value = [result.key]
    packageData.value = await getSkillPackage()
    if (packageData.value?.baseUrl) {
      baseUrl.value = normalizeSkillBaseUrl(packageData.value.baseUrl)
    }
    showKey.value = true
    statusMessage.value = translateUi('uiMessages.me2fb5ac82e4b')
  } catch (err) {
    error.value = err.message || translateUi('uiMessages.m438ebef5191d')
  } finally {
    loading.value = false
  }
}

async function confirmResetKey() {
  if (!activeKey.value?.id) return
  if (!window.confirm(translateUi('uiMessages.mff2f151107da'))) return
  resetting.value = true
  error.value = ''
  try {
    const result = await resetSkillKey(activeKey.value.id)
    keys.value = normalizeKeyResponse(result)
    if (!keys.value.length && result?.key) keys.value = [result.key]
    packageData.value = await getSkillPackage()
    if (packageData.value?.baseUrl) {
      baseUrl.value = normalizeSkillBaseUrl(packageData.value.baseUrl)
    }
    showKey.value = true
    statusMessage.value = translateUi('uiMessages.m40d0a716b481')
  } catch (err) {
    error.value = err.message || translateUi('uiMessages.m5d0b71a01907')
  } finally {
    resetting.value = false
  }
}

async function copyText(text, message) {
  if (!text) return
  await navigator.clipboard.writeText(text)
  statusMessage.value = message
}

function downloadPackage() {
  if (!packagePayload.value) return
  const body = JSON.stringify(packagePayload.value, null, 2)
  const blob = new Blob([body], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${packageData.value?.skillSlug || 'canvas-skill'}.package.json`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(loadSkills)
</script>

<style scoped>
.skills-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.54);
}

.skills-panel {
  width: min(860px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  border: 1px solid var(--canvas-border-subtle);
  border-radius: 12px;
  background: var(--canvas-bg-secondary);
  box-shadow: 0 30px 120px rgba(0, 0, 0, 0.58);
  color: var(--canvas-text-primary);
  backdrop-filter: blur(22px);
}

.skills-panel-header,
.skills-card-head,
.skills-actions,
.skills-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.skills-panel-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--canvas-border-subtle);
}

.skills-panel-kicker,
.skills-label {
  margin: 0 0 4px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.skills-panel h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.skills-close-btn,
.skills-icon-btn,
.skills-link-btn,
.skills-docs-link {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.86);
  cursor: pointer;
  font-size: 12px;
  text-decoration: none;
}

.skills-close-btn {
  width: 32px;
  height: 32px;
  font-size: 22px;
  line-height: 1;
  border: none;
  background: transparent;
  color: var(--canvas-text-tertiary);
  border-radius: 8px;
}

.skills-close-btn:hover {
  background: var(--canvas-bg-tertiary);
  color: var(--canvas-text-primary);
}

.skills-field,
.skills-card {
  margin: 0 24px 16px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
}

.skills-field {
  display: grid;
  gap: 6px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
}

.skills-field code,
.skills-key-row code {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills-card-head strong {
  display: block;
  font-size: 14px;
}

.skills-key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin: 12px 0;
  padding: 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
}

.skills-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.skills-actions.centered {
  justify-content: center;
}

.skills-actions button {
  /* 视觉由 btn-primary / btn-secondary 分级类控制 */
  font-size: 13px;
}

.skills-docs-link,
.skills-link-btn,
.skills-icon-btn {
  padding: 8px 10px;
}

.skills-icon-btn:disabled,
.skills-link-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.skills-markdown-preview {
  max-height: 190px;
  overflow: auto;
  margin: 12px 0;
  padding: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.26);
  color: rgba(255, 255, 255, 0.76);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.skills-install-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0 auto 22px;
  padding: 4px;
  width: min(420px, calc(100% - 48px));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.skills-install-tabs button {
  min-width: 0;
  min-height: 40px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.52);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
}

.skills-install-tabs button.active {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.94);
}

.skills-agent-install {
  padding: 34px 36px 38px;
}

.skills-agent-copy {
  max-width: 620px;
  margin: 0 auto 28px;
  color: rgba(255, 255, 255, 0.86);
  font-size: 15px;
  line-height: 1.7;
  text-align: center;
}

.skills-prompt-label {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 700;
}

.skills-prompt-box {
  min-height: 58px;
  max-height: 220px;
  overflow: auto;
  margin: 0 0 24px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.92);
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.skills-manual-grid {
  display: block;
}

.skills-alert {
  margin: 0 24px 16px;
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
  font-size: 13px;
}

.skills-panel-footer {
  padding: 0 24px 22px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  text-align: center;
}

:root.canvas-theme-light .skills-panel-backdrop {
  background: rgba(15, 23, 42, 0.28);
}

:root.canvas-theme-light .skills-panel {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 30px 90px rgba(15, 23, 42, 0.22);
  color: #111827;
}

:root.canvas-theme-light .skills-panel-kicker,
:root.canvas-theme-light .skills-label,
:root.canvas-theme-light .skills-prompt-label {
  color: #64748b;
}

:root.canvas-theme-light .skills-panel h2,
:root.canvas-theme-light .skills-card-head strong {
  color: #111827;
}

:root.canvas-theme-light .skills-close-btn {
  border-color: transparent;
  background: transparent;
  color: var(--canvas-text-tertiary);
}

:root.canvas-theme-light .skills-close-btn:hover {
  border-color: transparent;
  background: var(--canvas-bg-tertiary);
  color: var(--canvas-text-primary);
}

:root.canvas-theme-light .skills-icon-btn,
:root.canvas-theme-light .skills-link-btn,
:root.canvas-theme-light .skills-docs-link {
  border-color: rgba(15, 23, 42, 0.12);
  background: rgba(248, 250, 252, 0.92);
  color: #0f172a;
}

:root.canvas-theme-light .skills-icon-btn:hover,
:root.canvas-theme-light .skills-link-btn:hover,
:root.canvas-theme-light .skills-docs-link:hover {
  border-color: rgba(15, 23, 42, 0.2);
  background: #ffffff;
}

:root.canvas-theme-light .skills-field {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(248, 250, 252, 0.86);
  color: #475569;
}

:root.canvas-theme-light .skills-card {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(255, 255, 255, 0.86);
}

:root.canvas-theme-light .skills-field code,
:root.canvas-theme-light .skills-key-row code {
  color: #111827;
}

:root.canvas-theme-light .skills-key-row,
:root.canvas-theme-light .skills-markdown-preview {
  background: rgba(241, 245, 249, 0.88);
  color: #334155;
}

:root.canvas-theme-light .skills-install-tabs {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(241, 245, 249, 0.78);
}

:root.canvas-theme-light .skills-install-tabs button {
  color: #64748b;
}

:root.canvas-theme-light .skills-install-tabs button.active {
  background: #ffffff;
  color: #111827;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
}

:root.canvas-theme-light .skills-agent-copy {
  color: #334155;
}

:root.canvas-theme-light .skills-prompt-box {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(248, 250, 252, 0.95);
  color: #111827;
}

:root.canvas-theme-light .skills-alert {
  border-color: rgba(220, 38, 38, 0.22);
  background: rgba(254, 226, 226, 0.78);
  color: #991b1b;
}

:root.canvas-theme-light .skills-panel-footer {
  color: #64748b;
}

@media (max-width: 640px) {
  .skills-panel-backdrop {
    padding: 12px;
    align-items: stretch;
  }

  .skills-panel {
    width: 100%;
    max-height: calc(100vh - 24px);
  }

  .skills-panel-header {
    padding: 14px 16px;
  }

  .skills-panel h2 {
    font-size: 15px;
  }

  .skills-install-tabs {
    width: calc(100% - 32px);
    margin-bottom: 16px;
  }

  .skills-field,
  .skills-card {
    margin-inline: 16px;
  }

  .skills-agent-install {
    padding: 24px 16px 28px;
  }

  .skills-panel-footer {
    padding-inline: 16px;
  }
}
</style>

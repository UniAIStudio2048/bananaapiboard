<template>
  <div class="skills-panel-backdrop" @click.self="emit('close')">
    <section class="skills-panel" role="dialog" aria-modal="true" aria-labelledby="skills-panel-title">
      <header class="skills-panel-header">
        <div>
          <p class="skills-panel-kicker">Banana Canvas Skills</p>
          <h2 id="skills-panel-title">安装到 AI Agent</h2>
        </div>
        <button class="skills-close-btn" type="button" title="关闭" @click="emit('close')">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div v-if="error" class="skills-alert">{{ error }}</div>

      <div class="skills-install-tabs" role="tablist" aria-label="安装方式">
        <button
          type="button"
          :class="{ active: installMode === 'agent' }"
          @click="installMode = 'agent'"
        >
          通过 AI Agent 安装
        </button>
        <button
          type="button"
          :class="{ active: installMode === 'manual' }"
          @click="installMode = 'manual'"
        >
          手动安装
        </button>
      </div>

      <section v-if="installMode === 'agent'" class="skills-card skills-agent-install">
        <p class="skills-agent-copy">
          将下面这段话直接发给你的 AI 助手，它会按当前域名和 API Key 完成安装与初始化，适用于 Codex、Claude Code、WorkBuddy、OpenClaw、Hermes 以及其他支持 Skills 调用的智能体。
        </p>
        <div class="skills-prompt-label">提示词</div>
        <pre class="skills-prompt-box">{{ agentInstallPrompt }}</pre>
        <div class="skills-actions centered">
          <button type="button" :disabled="!agentInstallPrompt" @click="copyText(agentInstallPrompt, '安装提示词已复制')">复制安装提示词</button>
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
              <strong>{{ activeKey?.key_prefix || '未创建' }}</strong>
            </div>
            <button class="skills-link-btn" type="button" :disabled="loading" @click="loadSkills">刷新</button>
          </div>
          <div class="skills-key-row">
            <code>{{ visibleKey }}</code>
            <button class="skills-icon-btn" type="button" :disabled="!fullKey" @click="showKey = !showKey">
              {{ showKey ? '隐藏' : '显示' }}
            </button>
          </div>
          <div class="skills-actions">
            <button type="button" :disabled="!fullKey" @click="copyText(fullKey, 'API Key 已复制')">复制 Key</button>
            <button type="button" :disabled="!activeKey?.id || resetting" @click="confirmResetKey">重置 Key</button>
            <button type="button" :disabled="loading" @click="ensureKey">创建 Key</button>
          </div>
        </div>

        <div class="skills-card">
          <div class="skills-card-head">
            <div>
              <span class="skills-label">SKILL.md</span>
              <strong>安装内容</strong>
            </div>
            <RouterLink class="skills-docs-link" to="/docs" target="_blank">打开文档</RouterLink>
          </div>
          <pre class="skills-markdown-preview">{{ markdownPreview }}</pre>
          <div class="skills-actions">
            <button type="button" :disabled="!skillMarkdown" @click="copyText(skillMarkdown, 'SKILL.md 已复制')">复制 SKILL.md</button>
            <button type="button" :disabled="!packagePayload" @click="downloadPackage">下载 package.json</button>
          </div>
        </div>
      </section>

      <footer class="skills-panel-footer">
        <span>{{ statusMessage || `使用 ${baseUrl} 调用 /api/skills/*。` }}</span>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { createSkillKey, getSkillKeys, getSkillPackage, resetSkillKey } from '@/api/skills'

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
  if (!fullKey.value) return '创建或重置后会显示完整 API Key'
  if (showKey.value) return fullKey.value
  const prefix = activeKey.value?.key_prefix || fullKey.value.slice(0, 16)
  return `${prefix}••••••••••••••••`
})
const skillMarkdown = computed(() => packageData.value?.markdown || '')
const markdownPreview = computed(() => skillMarkdown.value || '正在加载 SKILL.md...')
const packagePayload = computed(() => packageData.value?.package || null)
const agentInstallPrompt = computed(() => (
  packageData.value?.agent_install_prompt ||
  packagePayload.value?.files?.['AGENT_INSTALL_PROMPT.txt'] ||
  `请帮我安装 Banana Canvas Skills：${baseUrl.value}。API Key 加载后会自动填入。`
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
    error.value = err.message || '加载 Skills 失败'
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
    statusMessage.value = 'API Key 已创建'
  } catch (err) {
    error.value = err.message || '创建 API Key 失败'
  } finally {
    loading.value = false
  }
}

async function confirmResetKey() {
  if (!activeKey.value?.id) return
  if (!window.confirm('重置后旧 API Key 会失效，继续？')) return
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
    statusMessage.value = 'API Key 已重置'
  } catch (err) {
    error.value = err.message || '重置 API Key 失败'
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
  link.download = 'banana-canvas-skill.package.json'
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
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(14, 15, 18, 0.98);
  box-shadow: 0 30px 120px rgba(0, 0, 0, 0.58);
  color: rgba(255, 255, 255, 0.9);
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
  padding: 22px 24px 16px;
}

.skills-panel-kicker,
.skills-label {
  margin: 0 0 4px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px;
  text-transform: uppercase;
}

.skills-panel h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.skills-close-btn,
.skills-icon-btn,
.skills-link-btn,
.skills-actions button,
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

.skills-actions button,
.skills-docs-link,
.skills-link-btn,
.skills-icon-btn {
  padding: 8px 10px;
}

.skills-actions button:disabled,
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

:root.canvas-theme-light .skills-close-btn,
:root.canvas-theme-light .skills-icon-btn,
:root.canvas-theme-light .skills-link-btn,
:root.canvas-theme-light .skills-actions button,
:root.canvas-theme-light .skills-docs-link {
  border-color: rgba(15, 23, 42, 0.12);
  background: rgba(248, 250, 252, 0.92);
  color: #0f172a;
}

:root.canvas-theme-light .skills-close-btn:hover,
:root.canvas-theme-light .skills-icon-btn:hover,
:root.canvas-theme-light .skills-link-btn:hover,
:root.canvas-theme-light .skills-actions button:hover,
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
    padding: 18px 16px 12px;
  }

  .skills-panel h2 {
    font-size: 20px;
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

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

function cssBlock(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('shows the selected model as a removable tag inside the assistant input box', () => {
  assert.match(source, /<div class="input-box"[\s\S]*?>[\s\S]*?<div v-if="selectedAssistantModel" class="selected-model-tag">/)
  assert.match(source, /<ModelIcon :icon="getAssistantModelIcon\(selectedAssistantModel\)" :label="selectedAssistantModel\.label \|\| selectedAssistantModel\.value" \/>/)
  assert.match(source, /title="移除已选模型"[\s\S]*?@click="clearAssistantModel"/)
  assert.match(source, /const selectedAssistantModel = computed\(\(\) => \{[\s\S]*?modelPickerModels\.value\.find\(model => isAssistantModelSelected\(model\)\)/)
  const inputBox = cssBlock('.input-box')
  assert.match(inputBox, /display:\s*flex;/)
  assert.match(inputBox, /align-items:\s*flex-end;/)
  const tag = cssBlock('.selected-model-tag')
  assert.match(tag, /flex-shrink:\s*0;/)
})

test('shows the selected model and an explicitly referenced Skill context tag', () => {
  assert.match(source, /<div v-if="selectedAssistantModel \|\| referencedSkill" class="input-context-tags" aria-label="当前创作配置">/)
  assert.match(source, /v-if="referencedSkill" class="selected-model-tag selected-skill-tag"/)
  assert.match(source, /min-height:\s*188px;/)
  assert.match(source, /\.send-btn\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*36px;/)
  assert.match(source, /style="width: 19px; height: 19px"/)
  assert.match(source, /<path d="M12 19V5M5 12l7-7 7 7"\s*\/>/)
})

test('selected model is converted to a natural-language hint for this turn only', () => {
  assert.match(source, /function buildTurnModelHint\(\)[\s\S]*?selectedAssistantModel\.value/)
  assert.match(source, /modelPickerType\.value === 'video' \? '视频' : '图片'/)
  // hint 指示 LLM 把 model 参数指定为用户所选模型（与 MCP image-gen/video-gen 工具 schema 一致），
  // 不能写不存在的 requested_model 参数，否则 schema 拒绝、LLM 省略后服务端落到默认模型。
  assert.match(source, /调用生成工具时请将 model 参数指定为/)
  assert.match(source, /turn_model_hint: turnModelHint \|\| undefined/)
})

test('model selection is cleared after send so it never leaks into later turns', () => {
  assert.match(source, /const turnModelHint = buildTurnModelHint\(\)/)
  assert.match(source, /const turnModelValue = selectedModelValue\.value/)
  assert.match(source, /if \(turnModelHint\) \{[\s\S]*?selectedModelByType\.value = \{ image: '', video: '' \}/)
  assert.match(source, /skill_model: turnModelValue \|\| undefined/)
  assert.match(source, /skill_model_type: turnModelType \|\| undefined/)
})

test('uses CDN thumbnail URLs for icons in the model picker', () => {
  assert.match(source, /import \{ getAssistantModelIcon \} from '@\/utils\/aiAssistantModels'/)
  assert.match(source, /<ModelIcon :icon="getAssistantModelIcon\(model\)" :label="model\.label \|\| model\.value" \/>/)
})

test('enhanced mode converts the selected model tag into natural language for the Agent turn', () => {
  assert.match(source, /async function sendEnhancedMessage\(force = false\)[\s\S]*?const turnModelHint = buildTurnModelHint\(\)/)
  assert.match(source, /const turnModelRef = buildTurnModelRef\(\)/)
  assert.match(source, /const turnHint = \[[\s\S]*?turnModelHint,[\s\S]*?\]\.filter\(Boolean\)\.join\('\\n'\)/)
  assert.match(source, /if \(turnModelHint\) \{[\s\S]*?selectedModelByType\.value = \{ image: '', video: '' \}/)
  assert.match(source, /await sendCodexMessage\(\{[\s\S]*?content: messageText,[\s\S]*?hint: turnHint/)
})

test('video model mode selection is offered for multi-mode models and sent with the turn', () => {
  // 支持模式选择的模型类型（MiniMax H3 / Seedance 系 / Wan）
  assert.match(source, /VIDEO_MODE_MODEL_TYPES = \['minimax-h3', 'seedance-2\.0', 'seedance-openai', 'seedance-openapi-pro', 'bytefor', 'happyhorse', 'wan'\]/)
  // 内部模式枚举与 VideoNode 对齐
  assert.match(source, /value: 'text2video', label: '文生视频'[\s\S]*?value: 'image2video_first', label: '首帧'[\s\S]*?value: 'multimodal_ref', label: '多模态'/)
  // 弹窗内模式选择 UI
  assert.match(source, /modelPickerType === 'video' && selectedModelValue && selectedVideoModes\.length[\s\S]*?class="model-picker-modes"/)
  assert.match(source, /v-for="mode in selectedVideoModes"[\s\S]*?class="model-picker-mode"/)
  // hint 携带模式指令（video_mode 参数）
  assert.match(source, /video_mode 参数传 \$\{selectedVideoMode\.value\}/)
  // 发送参数携带 mode
  assert.match(source, /mode: turnVideoMode \|\| undefined,/)
  assert.match(source, /const turnVideoMode = modelPickerType\.value === 'video' \? selectedVideoMode\.value \|\| '' : ''/)
})

test('user message keeps the model reference card for display while sending natural language', () => {
  assert.match(source, /modelRef: turnModelRef/)
  assert.match(source, /function buildTurnModelRef\(\)[\s\S]*?return \{ label, modelId, type: modelPickerType\.value \}/)
})

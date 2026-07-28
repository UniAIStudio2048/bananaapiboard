import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')
const rules = readFileSync(new URL('../../../config/canvas/nodeTypes.js', import.meta.url), 'utf8')

test('AudioNode switches among Coze voice design, clone and TTS capabilities', () => {
  assert.match(source, /getAvailableAudioModels/)
  assert.match(source, /audioCapability/)
  assert.match(source, /voice_design/)
  assert.match(source, /voice_clone/)
  assert.match(source, /\/api\/audio\/generate/)
  assert.match(source, /\/api\/audio\/query\//)
  assert.match(source, /voiceDesignStyle/)
  assert.match(source, /voiceDialect/)
  assert.match(source, /voicePace/)
  assert.match(source, /voiceArticulation/)
  assert.match(source, /voiceDelivery/)
  assert.match(source, /voiceIntensity/)
  assert.match(source, /isVoiceStyleDropdownOpen/)
  assert.match(source, /toggleVoiceStyleDropdown/)
  assert.match(source, /class="voice-style-selector"/)
  assert.match(source, /audio-reference-remove/)
  assert.match(source, /function removeReferenceAudio\(/)
  assert.match(source, /canvasStore\.edges\.find\(edge => edge\.target === props\.id/)
  assert.match(source, /body\.style = voiceDesignStyle\.value/)
  assert.match(source, /audioCapability\.value === 'tts'[\s\S]*body\.prompt = musicPrompt\.value/)
  assert.doesNotMatch(source, /body\.text = musicPrompt\.value/)
  assert.match(source, /const parsedResponse = typeof response === 'string' \? JSON\.parse\(response\) : response/)
  assert.match(source, /const payload = parsedResponse\?\.data\?\.status \? parsedResponse\.data : parsedResponse/)
  assert.match(source, /const url = data\.audio_url \|\| data\.preview_url \|\| data\.url/)
  assert.match(source, /audioCapability\.value === 'voice_clone'\) \{\s*body\.prompt = musicPrompt\.value\s*body\.reference_audio_url = inheritedAudioUrl\.value/)
  assert.match(source, /说话的文本内容，描述希望角色说出的内容/)
  assert.match(source, /说话的文本内容，描述你需要克隆的文本内容/)
})

test('voice design offers VoxCPM-style articulation, delivery, and intensity controls', () => {
  assert.match(source, /吐字 \/ 口语感/)
  assert.match(source, /停顿 \/ 重音/)
  assert.match(source, /气息 \/ 力度/)
  assert.match(source, /句尾轻微上扬/)
  assert.match(source, /关键词轻微重读/)
  assert.match(source, /略带微笑/)
})

test('voice design presents options in a flat wide panel that owns its wheel scroll', () => {
  assert.match(source, /@wheel\.stop/)
  assert.match(source, /class="voice-style-flat-grid"/)
  assert.match(source, /class="voice-style-field-trigger"/)
  assert.match(source, /class="voice-style-field-dropdown"/)
  assert.match(source, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(source, /voice-style-field-icon/)
  assert.match(source, /toggleVoiceStyleFieldDropdown/)
  assert.match(source, /class="voice-style-reset"/)
  assert.match(source, /resetVoiceDesignStyle/)
  assert.match(source, /重置全部/)
  assert.match(source, /savedVoiceStyles/)
  assert.match(source, /saveVoiceDesignStyle/)
  assert.match(source, /isVoiceStyleConfirmOpen/)
  assert.match(source, /最多保存 10 组/)
  assert.doesNotMatch(source, /class="voice-style-select"/)
  assert.doesNotMatch(source, /activeVoiceStyleCategory/)
})

test('TTS offers a preset voice picker and respects reference audio priority', () => {
  assert.match(source, /VoicePresetPicker/)
  assert.match(source, /selectedVoicePreset/)
  assert.match(source, /audioCapability === 'tts'/)
  assert.match(source, /body\.reference_audio_url = inheritedAudioUrl\.value/)
  assert.match(source, /body\.voice_id = selectedVoicePreset\.value\.sourceVoice/)
  assert.match(source, /body\.reference_audio_text = selectedVoicePreset\.value\.transcript/)
})

test('selected TTS voice displays its complete ID in the control bar', () => {
  assert.match(source, /voicePresetTriggerLabel[\s\S]*selectedVoicePreset\.value\.sourceVoice/)
  const voicePresetStyle = source.match(/\.voice-preset-trigger \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.doesNotMatch(voicePresetStyle, /max-width:/)
  assert.doesNotMatch(voicePresetStyle, /overflow:\s*hidden/)
  assert.doesNotMatch(voicePresetStyle, /text-overflow:\s*ellipsis/)
})

test('voice output keeps voiceId and audio nodes may connect to audio nodes', () => {
  assert.match(source, /voiceId:\s*data\.voice_id/)
  assert.match(source, /sourceData\?\.voiceId/)
  assert.match(rules, /'audio':\s*\[\s*NODE_TYPES\.AUDIO_INPUT/)
})

test('Coze audio generation does not require input parameters at the node boundary', () => {
  assert.match(source, /const canGenerateCurrentAudio = computed\(\(\) => \{\s*if \(audioCapability\.value\) return true/)
})

test('audio output duration is normalized to a number after metadata loads', () => {
  assert.match(source, /const audioDuration = Number\(audioRef\.value\.duration\)/)
  assert.match(source, /output: \{ \.\.\.props\.data\.output, duration: audioDuration \}/)
})

test('AudioNode uses the shared processing card treatment', () => {
  assert.match(source, /'is-processing': props\.data\?\.status === 'processing'/)
  assert.match(source, /class="comet-border"/)
  assert.match(source, /v-if="props\.data\?\.status === 'processing'" class="node-content preview-loading"/)
  assert.match(source, /音频生成中\.\.\./)
})

test('AudioNode keeps the prompt panel available after audio output is generated', () => {
  assert.match(source, /class="music-gen-panel"/)
  assert.doesNotMatch(source, /<div v-if="!hasAudio" class="music-gen-panel">/)
})

test('AudioNode inserts supported speech-tone tokens into the prompt editor', () => {
  assert.match(source, /const speechToneGroups = \[/)
  assert.match(source, /label: '笑声', token: '\[laughing\]'/)
  assert.match(source, /label: '叹气', token: '\[sigh\]'/)
  assert.match(source, /label: '呃…', token: '\[Uhm\]'/)
  assert.match(source, /label: '嘘', token: '\[Shh\]'/)
  assert.match(source, /label: '咳嗽', token: '\[cough\]'/)
  assert.match(source, /label: '疑问啊', token: '\[Question-ah\]'/)
  assert.match(source, /label: '疑问诶', token: '\[Question-ei\]'/)
  assert.match(source, /label: '疑问嗯', token: '\[Question-en\]'/)
  assert.match(source, /label: '疑问哦', token: '\[Question-oh\]'/)
  assert.match(source, /label: '确认嗯', token: '\[Confirmation-en\]'/)
  assert.match(source, /label: '惊讶哇', token: '\[Surprise-wa\]'/)
  assert.match(source, /label: '惊讶哟', token: '\[Surprise-yo\]'/)
  assert.match(source, /label: '惊讶啊', token: '\[Surprise-ah\]'/)
  assert.match(source, /label: '惊讶哦', token: '\[Surprise-oh\]'/)
  assert.match(source, /label: '不满哼', token: '\[Dissatisfaction-hnn\]'/)
  assert.match(source, /function insertSpeechTone\(tone\) \{\s*insertMusicEditorPlainText\(tone\.token\)/)
  assert.match(source, /class="speech-tone-trigger"/)
  assert.match(source, /class="speech-tone-menu"/)
  assert.match(source, /function handleMusicModelDropdownClickOutside\(event\) \{[\s\S]*?event\.target\.closest\('\.speech-tone-toolbar'\)/)
  assert.match(source, /document\.addEventListener\('click', handleMusicModelDropdownClickOutside\)/)
  assert.doesNotMatch(source, /语气插入 <span>/)
  assert.match(source, /\.prompt-area \{[\s\S]*?border-top: 1px solid var\(--canvas-border-subtle, #2a2a2a\)/)
  assert.match(source, /function insertMusicEditorPlainText\(text\) \{[\s\S]*?const currentText = serializePromptEditorContent\(editor\)[\s\S]*?promptEditorRenderKey\.value \+= 1[\s\S]*?const nextEditor = promptTextareaRef\.value \|\| editor/)
  assert.match(source, /class="speech-tone-toolbar nodrag" @mousedown\.prevent\.stop/)
})

test('AudioNode routes post-generation actions through the right-side node creator', () => {
  assert.match(source, /class="node-add-btn node-add-btn-right nodrag"/)
  assert.match(source, /canvasStore\.openNodeSelector\(/)
  assert.doesNotMatch(source, /class="audio-info-panel"/)
  assert.doesNotMatch(source, /handleLipSync|handleAudioToVideo|handleAudioToText/)
  assert.doesNotMatch(source, /音频生视频/)
})

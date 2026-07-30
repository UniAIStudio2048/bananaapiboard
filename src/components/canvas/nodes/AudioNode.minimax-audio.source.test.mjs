import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('MiniMax voice design sends description and preview text separately', () => {
  assert.match(source, /const isMiniMaxAudio = computed\(\(\) => currentMusicModelConfig\.value\?\.provider === 'minimax'\)/)
  assert.match(source, /isMiniMaxAudio\.value && audioCapability\.value === 'voice_design'[\s\S]*?body\.prompt = voiceDesignStyle\.value[\s\S]*?body\.preview_text = musicPrompt\.value/)
  assert.match(source, /输入试听文案（不超过 500 字）/)
  assert.match(source, /return 500/)
})

test('MiniMax TTS only submits the selected controlled voice ID and supports 50000 characters', () => {
  assert.match(source, /isMiniMaxAudio\.value && audioCapability\.value === 'tts'[\s\S]*?body\.text = musicPrompt\.value[\s\S]*?body\.voice_id = selectedVoicePreset\.value\?\.sourceVoice/)
  assert.match(source, /return 50000/)
  assert.match(source, /!!selectedVoicePreset\.value\?\.sourceVoice/)
  assert.match(source, /:provider="isMiniMaxAudio \? 'minimax' : isFishAudio \? 'fish' : 'coze'"/)
  assert.match(source, /const voiceClonePointsCost = computed\(\(\) => currentMusicModelConfig\.value\?\.voiceClonePointsCost \?\? null\)/)
  assert.match(source, /:clone-points-cost="voiceClonePointsCost"/)
  assert.match(source, /:space-type="voiceCloneSpaceParams\.spaceType"/)
})

test('a completed MiniMax voice design can be saved manually to my voices', () => {
  assert.match(source, /\['minimax', 'fish'\]\.includes\(generatedNodeData\.audioProvider\) && generatedNodeData\.audioCapability === 'voice_design'/)
  assert.match(source, /function saveDesignedVoice\(\)/)
  assert.match(source, /\/api\/audio\/user-voices\/from-design/)
  assert.match(source, /保存到我的音色/)
})

test('Fish Audio allows an optional voice for synchronous TTS and preserves its provider on completion', () => {
  assert.match(source, /const isFishAudio = computed\(\(\) => currentMusicModelConfig\.value\?\.provider === 'fish'\)/)
  assert.match(source, /isFishAudio\.value && audioCapability\.value === 'voice_design'[\s\S]*?return 150/)
  assert.match(source, /isFishAudio\.value && audioCapability\.value === 'tts'[\s\S]*?return 50000/)
  assert.match(source, /body\.voice_id = selectedVoicePreset\.value\.sourceVoice/)
  assert.match(source, /audioProvider: isMiniMaxAudio\.value \? 'minimax' : isFishAudio\.value \? 'fish' : 'coze'/)
})

test('MiniMax TTS exposes pause and Chinese paralinguistic insertion controls only for that provider', () => {
  assert.match(source, /v-if="isMiniMaxAudio && audioCapability === 'tts'" class="minimax-speech-tools"/)
  assert.match(source, /const speechPauseOptions = \[0\.25, 0\.5, 1, 1\.5\]/)
  assert.match(source, /function formatSpeechPauseToken\(seconds\) \{[\s\S]*?return `<#\$\{formattedSeconds\}#>`/)
  assert.match(source, /function insertSpeechPause\(seconds\) \{[\s\S]*?formatSpeechPauseToken\(seconds\)[\s\S]*?insertMusicEditorPlainText\(token\)/)
  assert.match(source, /自定义停顿/)

  for (const cue of ['笑声', '轻笑', '咳嗽', '清嗓子', '呻吟', '正常换气', '喘气', '吸气', '叹气', '哼', '打嗝', '咂嘴', '哼唱', '嘶嘶声', '呃', '喷嚏']) {
    assert.match(source, new RegExp(`'${cue}'`))
  }
  assert.match(source, /insertMusicEditorPlainText\(`（\$\{cue\}）`\)/)
})

test('MiniMax TTS insertion controls stay on one toolbar row', () => {
  assert.match(source, /\.minimax-speech-tools\s*\{[\s\S]*?display: flex;[\s\S]*?align-items: center;/)
  assert.match(source, /\.speech-tool\s*\{[\s\S]*?position: relative;/)
})

test('MiniMax custom pause input uses the same compact dark control style', () => {
  assert.match(source, /\.speech-pause-custom\s*\{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?border-top:/)
  assert.match(source, /\.speech-pause-custom input\s*\{[\s\S]*?min-height: 27px;[\s\S]*?background: rgba\(255, 255, 255, 0\.06\);/)
  assert.match(source, /\.speech-pause-custom button\s*\{[\s\S]*?min-height: 27px;/)
})

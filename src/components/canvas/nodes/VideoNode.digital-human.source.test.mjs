import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./VideoNode.vue', import.meta.url)), 'utf8')

test('视频节点将数字人口播和视频换口型提交至 HeyGen 专用异步任务', () => {
  assert.match(source, /createDigitalHumanVideo/)
  assert.match(source, /createDigitalHumanLipsync/)
  assert.match(source, /type: capturedState\.isHeygenMode \? 'digital-human-video' : 'video'/)
  assert.match(source, /sourceNode\.type === 'digital-human'/)
})

test('视频节点将数字人形象图引用识别为绑定的数字人资产', () => {
  assert.match(source, /const markedDigitalHumanAssetId = metadata\.digitalHumanAssetId \|\| sourceNode\.data\?\.digitalHumanAssetId \|\| ''/)
  assert.match(source, /const legacyDigitalHumanAssetId = sourceNode\.data\?\.assetType === 'digital-human' \? sourceNode\.data\?\.assetId : ''/)
  assert.match(source, /const digitalHumanAssetId = isHeygenModelSelected\.value\s*\? \(markedDigitalHumanAssetId \|\| legacyDigitalHumanAssetId\)\s*: ''/)
  assert.match(source, /digitalHumans\.push\(\{\s*assetId: digitalHumanAssetId,\s*channelId/)
  assert.match(source, /imageHeight: Number\(metadata\.imageHeight\) \|\| 0/)
})

test('数字人和换口型在画布中按音频时长展示每秒预估积分', () => {
  assert.match(source, /const heygenPointsPerSecond = computed\(/)
  assert.match(source, /const heygenPointsCost = computed\(/)
  assert.match(source, /audioDuration/)
  assert.match(source, /formatPoints\(heygenPointsCost\)/)
})

test('HeyGen a2v 模型可在画布模型菜单中被选择，并沿用数字人专用请求', () => {
  assert.match(source, /const isHeygenModel = model => model\?\.apiType === 'heygen'/)
  assert.match(source, /isHeygenModel\(m\) \|\| supportsCurrentMode\(m, currentMode\)/)
  assert.match(source, /const isHeygenModelSelected = computed\(\(\) => isHeygenModel\(currentModelConfig\.value\)\)/)
  assert.match(source, /const isHeygenFlow = isHeygenModelSelected\.value \|\| upstreamData\.digitalHumans\.length > 0/)
  assert.match(source, /HeyGen 需要连接数字人资产和音频，或同时连接视频和音频/)
  assert.match(source, /v-if="!isHeygenMode \|\| isHeygenModelSelected"/)
})

test('HeyGen 渠道控件使用中性样式，并说明支持的输入组合', () => {
  assert.match(source, /const heygenInputHint = computed\(/)
  assert.match(source, /数字人资产 \+ 音频/)
  assert.match(source, /视频 \+ 音频（换口型）/)
  assert.match(source, /已随数字人资产绑定/)
  assert.match(source, /heygenChannels\.length === 1 \? '默认渠道' : channel\.name/)
  assert.doesNotMatch(source, /heygenVoiceId/)
  assert.match(source, /aspectRatio: selectedAspectRatio\.value/)
  assert.match(source, /imageHeight > capturedState\.digitalHuman\?\.imageWidth\s*\? '9:16'/)

  const styleStart = source.indexOf('.heygen-flow-control')
  const styleEnd = source.indexOf('.model-selector-custom', styleStart)
  const styles = source.slice(styleStart, styleEnd)
  assert.doesNotMatch(styles, /#67e8f9|#0f172a|#e2e8f0|#cbd5e1/)
})

test('HeyGen 渠道复用画面比例的自定义下拉，输入说明位于弹窗卡片内', () => {
  assert.match(source, /const selectedHeygenChannelName = computed\(/)
  assert.match(source, /class="heygen-channel-selector"/)
  assert.match(source, /toggleVideoModeDropdown\('heygen-channel', \$event\)/)
  assert.match(source, /videoModeDropdownOpen === 'heygen-channel'/)
  assert.match(source, /key === 'heygen-channel'/)
  assert.match(source, /class="heygen-channel-input-hint">\{\{ heygenInputHint \}\}<\/div>/)
  assert.doesNotMatch(source, /<select :value="props\.data\?\.heygenChannelId/)
})

test('HeyGen 输入说明排在渠道选项之后，不显示在视频节点底部', () => {
  const panelStart = source.indexOf('class="video-mode-dropdown-panel heygen-channel-dropdown-panel"')
  const panelEnd = source.indexOf('</Transition>', panelStart)
  const panel = source.slice(panelStart, panelEnd)

  assert.match(panel, /v-for="channel in heygenChannels"[\s\S]*heygen-channel-input-hint/)
  assert.doesNotMatch(source, /class="heygen-input-hint"/)
})

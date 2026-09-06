import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref, watch, effectScope, nextTick } from 'vue'
import { WAN3_MODES } from '../../../utils/videoGenerationMode.js'
import { pickInitialSubmode } from '../../../utils/videoSubmodeDefaults.js'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const watcherStart = source.indexOf('watch(currentModelConfig, modelConfig => {')
const watcherEnd = source.indexOf('}, { immediate: true })', watcherStart) + '}, { immediate: true })'.length
const selectorStart = source.indexOf('const activeVideoModeSelector = computed(() => {')
const selectorEnd = source.indexOf('\nconst activeVideoSubmodeSelector', selectorStart)
const wan3Flag = source.match(/const isWan3Model = computed\([^\n]+/)[0]

test('Wan3 dropdown uses API type and tenant default with arbitrary model names', async () => {
  for (const savedMode of [undefined, 'invalid', 'image2video_first']) {
    const scope = effectScope()
    const modelConfig = ref({ value: 'custom-video-name', apiType: 'wan3', wan3Config: { defaultMode: 'multimodal_ref' } })
    const selectedWan3Mode = ref(savedMode || 'text2video')
    const sandbox = {
      computed, watch, currentModelConfig: modelConfig, selectedWan3Mode,
      props: { data: { wan3Mode: savedMode } }, pickInitialSubmode, WAN3_MODES
    }
    for (const name of ['isKlingMotionControl', 'isCozeVideoSwapModel', 'isViduModel', 'isVeoModel', 'isKlingO1Model', 'isKlingV3OmniModel', 'isRouterBeeWan3Model', 'isWanModel', 'isSeedance2Model', 'isMinimaxH3Model', 'isRunningHubAiAppVideoV31Model']) {
      sandbox[name] = ref(false)
    }
    try {
      const selector = scope.run(() => runInNewContext(
        `${wan3Flag}\n${source.slice(watcherStart, watcherEnd)}\n${source.slice(selectorStart, selectorEnd)}\nactiveVideoModeSelector`, sandbox
      ))
      assert.equal(selectedWan3Mode.value, savedMode === 'image2video_first' ? savedMode : 'multimodal_ref')
      assert.equal(selector.value.key, 'wan3')
      assert.equal(selector.value.options.find(option => option.value === selector.value.value).label,
        savedMode === 'image2video_first' ? '首帧' : '多模态参考')
      modelConfig.value = { value: 'wan3.0-video', apiType: 'unrelated' }
      await nextTick()
      assert.equal(selector.value, null)
    } finally {
      scope.stop()
    }
  }
})

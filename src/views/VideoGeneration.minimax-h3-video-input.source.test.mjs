import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')

test('新手视频页将 MiniMax H3 作为支持参考素材的模型', () => {
  assert.match(source, /const isMinimaxH3Model = computed\(\(\) => currentModelConfig\.value\?\.apiType === 'minimax-h3'\)/)
  assert.match(source, /const isReferenceVideoModel = computed\(\(\) => isSeedanceModel\.value \|\| isMinimaxH3Model\.value\)/)
  assert.match(source, /isSeedanceSd2VideoModel\(m\) \|\| m\.apiType === 'minimax-h3'/)
})

test('MiniMax H3 多模态模式复用新手页的视频上传与提交字段', () => {
  assert.match(source, /v-if="isReferenceVideoModel" class="space-y-3"/)
  assert.match(source, /seedanceMode === 'multimodal_ref' \|\| seedanceMode === 'video_edit' \|\| seedanceMode === 'video_extend'/)
  assert.match(source, /formData\.append\('seedance_mode', seedanceMode\.value\)/)
  assert.match(source, /formData\.append\('referenceVideos', file\)/)
  assert.match(source, /formData\.append\('reference_videos', JSON\.stringify\(seedanceRefVideoUrls\.value\)\)/)
})

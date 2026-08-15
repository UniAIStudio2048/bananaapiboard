import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const homeSource = await readFile(new URL('./CommunityHome.vue', import.meta.url), 'utf8')
const bannerSource = await readFile(new URL('../components/community/BannerCarousel.vue', import.meta.url), 'utf8')
const templateSource = await readFile(new URL('../components/community/TemplateGallery.vue', import.meta.url), 'utf8')

test('社区首页不等待未使用的标签，并缩小首批横屏作品数', () => {
  assert.doesNotMatch(homeSource, /communityStore\.loadTags\(\)/)
  assert.match(homeSource, /orientation: 'landscape', pageSize: 15, page: 1/)
})

test('社区首页首屏不使用固定加载遮罩', () => {
  assert.doesNotMatch(homeSource, /fixed inset-0 z-40 bg-black flex items-center justify-center/)
})

test('工作流预览仅在用户打开预览时加载', () => {
  for (const source of [bannerSource, templateSource]) {
    assert.match(source, /defineAsyncComponent/)
    assert.match(source, /const WorkflowPreviewModal = defineAsyncComponent\(\(\) => import\('\.\/WorkflowPreviewModal\.vue'\)\)/)
    assert.doesNotMatch(source, /import WorkflowPreviewModal from '\.\/WorkflowPreviewModal\.vue'/)
  }
  assert.match(templateSource, /<WorkflowPreviewModal\s+v-if="showPreview"/)
})

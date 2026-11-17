import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { effectScope, nextTick, reactive, ref, watch } from 'vue'
import { bindMediaMention, isPromptMediaReady, syncPromptMediaMentions } from '../../../utils/promptMediaBindings.js'

const media = (id, index) => ({ type: 'image', index, label: `图片${index}`, url: `${id}.png`, key: `image:node:${id}:${index}` })
const original = [media('a', 1), media('b', 2)]
const prompt = 'A @图片1 说第一句，B @图片2 说第二句'

for (const file of ['ImageNode.vue', 'VideoNode.vue', 'TextNode.vue']) {
  test(`${file}: real reference watcher preserves loading data and persists a complete reorder once`, async () => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    const functions = ['updatePromptMentionBindings', 'syncPromptMentionsWithMedia'].map(name => {
      const match = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}(?=\\n)`))
      assert.ok(match, name)
      return match[0]
    }).join('\n')
    const watcher = source.match(/watch\(\n  \(\) => `\$\{isPromptMediaReady[\s\S]*?\n\)/)?.[0]
    assert.ok(watcher, 'component reference watcher')
    const text = ref(prompt)
    const bindings = ref(original.reduce((all, item) => bindMediaMention(all, item), {}))
    const before = JSON.parse(JSON.stringify(bindings.value))
    const references = ref([])
    const writes = []
    const canvasStore = reactive({
      nodes: [{ id: 'target', data: {} }, { id: 'a', data: { _mediaLoading: true } }, { id: 'b', data: { _mediaLoading: true } }],
      edges: [{ source: 'a', target: 'target' }, { source: 'b', target: 'target' }],
      updateNodeData(id, patch) { writes.push(JSON.parse(JSON.stringify(patch))) }
    })
    const scope = effectScope()
    try {
      scope.run(() => runInNewContext(`${functions}\n${watcher}`, {
        props: { id: 'target' }, promptText: text, llmInputText: text,
        promptMentionBindings: bindings, referenceMediaList: references,
        canvasStore, isPromptMediaReady, syncPromptMediaMentions, watch
      }))
      assert.equal(writes.length, 0)
      references.value = [media('b', 1)]
      canvasStore.nodes[2].data._mediaLoading = false
      await nextTick()
      assert.equal(writes.length, 0)
      assert.equal(text.value, prompt)
      assert.deepEqual(JSON.parse(JSON.stringify(bindings.value)), before)

      references.value = [media('b', 1), media('a', 2)]
      await nextTick()
      assert.equal(writes.length, 0, 'wait for loading flags even when URLs are present')
      canvasStore.nodes[1].data._mediaLoading = false
      await nextTick()
      assert.equal(text.value, 'A @图片2 说第一句，B @图片1 说第二句')
      assert.equal(writes.length, 1)
      assert.equal(writes[0].promptMentionBindings['image:node:a:2'].url, 'a.png')
      if (file !== 'TextNode.vue') assert.equal(writes[0].prompt, text.value)

      // Reopening and restoring unchanged media must not publish an empty binding update.
      canvasStore.nodes[1].data._mediaLoading = true
      references.value = []
      await nextTick()
      references.value = [media('b', 1), media('a', 2)]
      canvasStore.nodes[1].data._mediaLoading = false
      await nextTick()
      assert.equal(writes.length, 1)
      assert.equal(text.value, 'A @图片2 说第一句，B @图片1 说第二句')
    } finally {
      scope.stop()
    }
  })
}

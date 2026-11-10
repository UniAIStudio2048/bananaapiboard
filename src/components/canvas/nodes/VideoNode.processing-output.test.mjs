import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('regenerating video nodes do not render the previous output media', () => {
  assert.match(
    source,
    /const isGenerationInProgress = computed\(\(\) => \['processing', 'pending'\]\.includes\(String\(props\.data\?\.status \|\| ''\)\.toLowerCase\(\)\)\)/
  )
  assert.match(
    source,
    /const hasOutput = computed\(\(\) => !isGenerationInProgress\.value && !!props\.data\.output\?\.url\)/
  )
})

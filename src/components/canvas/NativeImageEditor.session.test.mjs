import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'NativeImageEditor.vue'), 'utf8')

assert.match(source, /import\s*\{\s*[^}]*computed[^}]*\}\s*from 'vue'/, 'NativeImageEditor should use computed sizing state')
assert.match(source, /from '\.\/imageEditSession\.js'/, 'NativeImageEditor should use image edit session helpers')
assert.match(source, /const displayWidth = ref\(/, 'NativeImageEditor should track scaled display width separately')
assert.match(source, /const displayHeight = ref\(/, 'NativeImageEditor should track scaled display height separately')
assert.match(source, /const exportInfo = computed\(/, 'NativeImageEditor should compute export format from the source image')
assert.match(source, /from '\.\/nativeImageEditorCoords\.js'/, 'NativeImageEditor should use shared pointer coordinate mapping')
assert.match(source, /getNativeImageEditorPointerCoords\(e, rect/, 'NativeImageEditor should map pointer coordinates back to original pixels')
assert.match(source, /displayX/, 'NativeImageEditor should keep display coordinates for DOM overlays')
assert.match(source, /snapshotUrl: imageData/, 'NativeImageEditor history snapshots should use snapshotUrl keys')
assert.match(source, /editState: getEditState\(\)/, 'NativeImageEditor save event should expose the full edit state')

console.log('NativeImageEditor session tests passed')

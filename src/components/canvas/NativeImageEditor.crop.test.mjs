import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'NativeImageEditor.vue'), 'utf8')

function getFunctionBody(name) {
  const start = source.indexOf(`async function ${name}()`)
  assert.notEqual(start, -1, `${name} should exist`)

  const bodyStart = source.indexOf('{', start)
  let depth = 0

  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') depth -= 1
    if (depth === 0) {
      return source.slice(bodyStart + 1, i)
    }
  }

  throw new Error(`Could not parse ${name} body`)
}

const applyCropBody = getFunctionBody('applyCrop')

const resizeIndex = applyCropBody.indexOf('canvasWidth.value')
const nextTickIndex = applyCropBody.indexOf('await nextTick()', resizeIndex)
const setupIndex = applyCropBody.indexOf('setupCanvas()', nextTickIndex)
const drawIndex = applyCropBody.indexOf('mainCtx.value.drawImage(tempCanvas', nextTickIndex)

assert.notEqual(nextTickIndex, -1, 'applyCrop should await DOM resize after updating canvas dimensions')
assert.notEqual(setupIndex, -1, 'applyCrop should rebind canvas contexts after canvas resize')
assert.notEqual(drawIndex, -1, 'applyCrop should draw the cropped temp canvas after resize')
assert.ok(setupIndex < drawIndex, 'applyCrop must rebind contexts before drawing the cropped temp canvas')

assert.match(
  applyCropBody,
  /const\s+cropX\s*=\s*Math\.max\(0,\s*Math\.round\(/,
  'applyCrop should round and clamp crop x before drawing'
)
assert.match(
  applyCropBody,
  /const\s+cropWidth\s*=\s*Math\.max\(1,\s*Math\.min\(/,
  'applyCrop should clamp crop width to at least one pixel and the current canvas bounds'
)
assert.match(
  applyCropBody,
  /tempCanvas\.width\s*=\s*cropWidth/,
  'temp canvas width should use the normalized integer crop width'
)
assert.match(
  applyCropBody,
  /tempCanvas\.height\s*=\s*cropHeight/,
  'temp canvas height should use the normalized integer crop height'
)

console.log('NativeImageEditor crop regression tests passed')

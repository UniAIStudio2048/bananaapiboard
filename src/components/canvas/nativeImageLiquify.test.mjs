import { strict as assert } from 'node:assert'
import {
  applyLiquifyPush,
  clampLiquifySettings
} from './nativeImageLiquify.js'

function createImageData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      data[index] = x * 20
      data[index + 1] = y * 20
      data[index + 2] = (x + y) * 10
      data[index + 3] = 255
    }
  }
  return { data, width, height }
}

function changedPixelCount(before, after) {
  let count = 0
  for (let i = 0; i < before.data.length; i += 4) {
    if (
      before.data[i] !== after.data[i] ||
      before.data[i + 1] !== after.data[i + 1] ||
      before.data[i + 2] !== after.data[i + 2] ||
      before.data[i + 3] !== after.data[i + 3]
    ) {
      count++
    }
  }
  return count
}

function totalDifference(before, after) {
  let total = 0
  for (let i = 0; i < before.data.length; i++) {
    total += Math.abs(before.data[i] - after.data[i])
  }
  return total
}

{
  const source = createImageData(8, 8)
  const result = applyLiquifyPush(source, {
    previous: { x: 4, y: 4 },
    current: { x: 4, y: 4 },
    radius: 3,
    pressure: 0.5
  })

  assert.deepEqual(
    Array.from(result.data),
    Array.from(source.data),
    'zero movement should leave image data unchanged'
  )
}

{
  const source = createImageData(12, 12)
  const weak = applyLiquifyPush(source, {
    previous: { x: 4, y: 6 },
    current: { x: 8, y: 6 },
    radius: 5,
    pressure: 0.25
  })
  const strong = applyLiquifyPush(source, {
    previous: { x: 4, y: 6 },
    current: { x: 8, y: 6 },
    radius: 5,
    pressure: 0.9
  })

  assert.ok(
    totalDifference(source, strong) > totalDifference(source, weak),
    'higher pressure should produce a stronger displacement'
  )
}

{
  const source = createImageData(16, 16)
  const small = applyLiquifyPush(source, {
    previous: { x: 8, y: 8 },
    current: { x: 11, y: 8 },
    radius: 2,
    pressure: 0.8
  })
  const large = applyLiquifyPush(source, {
    previous: { x: 8, y: 8 },
    current: { x: 11, y: 8 },
    radius: 5,
    pressure: 0.8
  })

  assert.ok(
    changedPixelCount(source, large) > changedPixelCount(source, small),
    'larger brush radius should affect more pixels'
  )
}

{
  const source = createImageData(8, 8)
  const result = applyLiquifyPush(source, {
    previous: { x: 0, y: 0 },
    current: { x: 3, y: 2 },
    radius: 5,
    pressure: 1
  })

  assert.equal(result.width, 8)
  assert.equal(result.height, 8)
  assert.equal(result.data.length, source.data.length)
  assert.ok(changedPixelCount(source, result) > 0, 'edge brush should still deform in-bounds pixels')
}

assert.deepEqual(clampLiquifySettings({ radius: -10, pressure: 4 }), {
  radius: 1,
  pressure: 1
})

assert.deepEqual(clampLiquifySettings({ radius: 500, pressure: -2 }), {
  radius: 300,
  pressure: 0
})

console.log('Native image liquify tests passed')

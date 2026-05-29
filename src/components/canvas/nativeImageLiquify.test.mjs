import { strict as assert } from 'node:assert'
import {
  applyLiquifyPush,
  clampLiquifySettings,
  getLiquifyDirtyRect
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

{
  const rect = getLiquifyDirtyRect({
    previous: { x: 50, y: 40 },
    current: { x: 65, y: 44 },
    radius: 12
  }, 200, 100)

  assert.deepEqual(
    rect,
    { x: 38, y: 28, width: 40, height: 29 },
    'dirty rect should cover the previous/current brush footprint without the full canvas'
  )
}

{
  const rect = getLiquifyDirtyRect({
    previous: { x: 2, y: 3 },
    current: { x: 5, y: 8 },
    radius: 10
  }, 20, 16)

  assert.deepEqual(
    rect,
    { x: 0, y: 0, width: 16, height: 16 },
    'dirty rect should clamp to image bounds near edges'
  )
}

{
  const fullSource = createImageData(24, 20)
  const previous = { x: 8, y: 10 }
  const current = { x: 13, y: 10 }
  const radius = 5
  const pressure = 0.75
  const rect = getLiquifyDirtyRect({ previous, current, radius }, fullSource.width, fullSource.height)
  const regionData = new Uint8ClampedArray(rect.width * rect.height * 4)

  for (let y = 0; y < rect.height; y++) {
    const sourceStart = ((rect.y + y) * fullSource.width + rect.x) * 4
    const targetStart = y * rect.width * 4
    regionData.set(fullSource.data.subarray(sourceStart, sourceStart + rect.width * 4), targetStart)
  }

  const fullResult = applyLiquifyPush(fullSource, { previous, current, radius, pressure })
  const regionResult = applyLiquifyPush(
    { data: regionData, width: rect.width, height: rect.height },
    { previous, current, radius, pressure, offsetX: rect.x, offsetY: rect.y }
  )

  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const fullIndex = ((rect.y + y) * fullSource.width + rect.x + x) * 4
      const regionIndex = (y * rect.width + x) * 4
      assert.deepEqual(
        Array.from(regionResult.data.slice(regionIndex, regionIndex + 4)),
        Array.from(fullResult.data.slice(fullIndex, fullIndex + 4)),
        'region liquify should match full-canvas liquify inside the dirty rect'
      )
    }
  }
}

console.log('Native image liquify tests passed')

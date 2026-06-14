import assert from 'node:assert/strict'
import {
  computeDirectorScreenshotSize,
  resolveDirectorAspectRatio,
  resolveDirectorAiRequestAspectRatio
} from './directorStudioSceneExport.js'

assert.deepEqual(computeDirectorScreenshotSize('16:9', '1080p'), { width: 1920, height: 1080 })
assert.deepEqual(computeDirectorScreenshotSize('9:16', '1080p'), { width: 608, height: 1080 })
assert.deepEqual(computeDirectorScreenshotSize('1:1', '1440p'), { width: 1440, height: 1440 })
assert.deepEqual(computeDirectorScreenshotSize('21:9', '4k'), { width: 5040, height: 2160 })
assert.equal(resolveDirectorAspectRatio({ aspectFrame: '3:2', aspectRatio: '16:9' }), '3:2')
assert.equal(resolveDirectorAspectRatio({ aspectFrame: 'panorama', aspectRatio: '4:3' }), '4:3')
assert.equal(resolveDirectorAiRequestAspectRatio({ aspectFrame: '3:2', aspectRatio: '3:2' }), 'auto')
assert.equal(resolveDirectorAiRequestAspectRatio({ aspectFrame: '16:9', aspectRatio: '16:9' }), '16:9')

console.log('directorStudioSceneExport tests passed')

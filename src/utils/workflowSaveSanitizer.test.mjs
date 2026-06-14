import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sanitizeWorkflowForSave } from './workflowSaveSanitizer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')

const dataUrl = `data:image/png;base64,${'a'.repeat(4096)}`
const blobUrl = 'blob:https://app.local/image-1'
const cdnUrl = 'https://cdn.example.com/image.png'

const workflow = {
  nodes: [
    {
      id: 'source',
      type: 'image',
      selected: true,
      position: { x: 0, y: 0 },
      data: {
        title: 'Source',
        output: {
          url: dataUrl,
          urls: [dataUrl, cdnUrl],
          images: [{ url: dataUrl, base64: dataUrl }, { url: cdnUrl }]
        },
        sourceImages: [blobUrl, dataUrl, cdnUrl],
        imageOrder: [dataUrl, cdnUrl]
      }
    },
    {
      id: 'target',
      type: 'image-to-image',
      position: { x: 100, y: 0 },
      data: {
        title: 'Target',
        inheritedData: {
          url: dataUrl,
          urls: [dataUrl, cdnUrl],
          nested: {
            imageData: dataUrl,
            base64: 'b'.repeat(2048)
          }
        },
        promptMentionBindings: {
          image1: {
            url: dataUrl,
            previewData: dataUrl,
            savedUrl: cdnUrl
          }
        },
        referenceImages: [
          dataUrl,
          { url: dataUrl, label: 'inline' },
          { url: cdnUrl, label: 'cdn' }
        ]
      }
    },
    {
      id: 'lost-upload',
      type: 'image',
      position: { x: 200, y: 0 },
      data: {
        title: 'Lost upload',
        isUploading: true,
        sourceImages: [blobUrl]
      }
    },
    {
      id: 'director',
      type: 'director-studio',
      position: { x: 300, y: 0 },
      data: {
        title: '3D导演台',
        snapshotUrl: dataUrl,
        snapshotHistory: [blobUrl, dataUrl, cdnUrl],
        backgroundImageUrl: blobUrl,
        backgroundPanoramaUrl: cdnUrl,
        sourceImages: [dataUrl, cdnUrl],
        output: { url: dataUrl, urls: [dataUrl, cdnUrl] },
        directorStudioProjects: [
          {
            id: 'project-1',
            name: '项目1',
            createdAt: 1,
            updatedAt: 2,
            coverUrl: dataUrl,
            snapshot: {
              snapshotUrl: dataUrl,
              snapshotHistory: [blobUrl, cdnUrl],
              backgroundImageUrl: blobUrl,
              backgroundPanoramaUrl: cdnUrl,
              items: [],
              referenceImages: [
                { url: dataUrl, label: 'inline' },
                { url: cdnUrl, label: 'cdn' }
              ]
            }
          }
        ]
      }
    }
  ],
  edges: [
    {
      id: 'edge-source-target',
      source: 'source',
      target: 'target',
      sourceNode: {
        id: 'source',
        data: { output: { url: dataUrl, urls: [dataUrl] } }
      },
      targetNode: {
        id: 'target',
        data: { inheritedData: { url: dataUrl, urls: [dataUrl] } }
      },
      sourceX: 10,
      sourceY: 20,
      targetX: 30,
      targetY: 40
    },
    {
      id: 'edge-to-removed',
      source: 'source',
      target: 'lost-upload'
    }
  ],
  viewport: { x: 1, y: 2, zoom: 0.8 }
}

const sanitized = sanitizeWorkflowForSave(workflow)
const serialized = JSON.stringify(sanitized)

assert.equal(serialized.includes(dataUrl), false, '保存数据不得包含 data: 内联图片')
assert.equal(serialized.includes(blobUrl), false, '保存数据不得包含 blob: 临时地址')
assert.equal(serialized.includes('b'.repeat(2048)), false, '保存数据不得包含大段裸 base64 字段')
assert.equal(serialized.includes(cdnUrl), true, '云端 URL 必须保留')

assert.deepEqual(
  sanitized.nodes.map(node => node.id),
  ['source', 'target', 'lost-upload', 'director'],
  '保存清理不能静默删除节点，否则大工作流保存成功后会丢节点'
)

const source = sanitized.nodes.find(node => node.id === 'source')
assert.deepEqual(source.data.sourceImages, [cdnUrl])
assert.deepEqual(source.data.output.urls, [cdnUrl])
assert.equal(source.data.output.url, null)
assert.deepEqual(source.data.imageOrder, [cdnUrl])
assert.equal(source.selected, undefined, 'Vue Flow 节点运行态字段不应进入保存数据')

const target = sanitized.nodes.find(node => node.id === 'target')
assert.equal(target.data.inheritedData.url, null)
assert.deepEqual(target.data.inheritedData.urls, [cdnUrl])
assert.equal(target.data.inheritedData.nested.imageData, undefined)
assert.equal(target.data.inheritedData.nested.base64, undefined)
assert.equal(target.data.promptMentionBindings.image1.url, null)
assert.equal(target.data.promptMentionBindings.image1.previewData, undefined)
assert.equal(target.data.promptMentionBindings.image1.savedUrl, cdnUrl)
assert.deepEqual(target.data.referenceImages, [{ url: cdnUrl, label: 'cdn' }])

const lostUpload = sanitized.nodes.find(node => node.id === 'lost-upload')
assert.deepEqual(lostUpload.data.sourceImages, [])
assert.equal(lostUpload.data.isUploading, undefined)
assert.equal(lostUpload.data.uploadFailed, undefined)

const director = sanitized.nodes.find(node => node.id === 'director')
assert.equal(director.data.snapshotUrl, null)
assert.deepEqual(director.data.snapshotHistory, [cdnUrl])
assert.equal(director.data.backgroundImageUrl, null)
assert.equal(director.data.backgroundPanoramaUrl, cdnUrl)
assert.deepEqual(director.data.sourceImages, [cdnUrl])
assert.deepEqual(director.data.output.urls, [cdnUrl])
assert.equal(director.data.directorStudioProjects[0].coverUrl, null)
assert.equal(director.data.directorStudioProjects[0].snapshot.snapshotUrl, null)
assert.deepEqual(director.data.directorStudioProjects[0].snapshot.snapshotHistory, [cdnUrl])
assert.deepEqual(director.data.directorStudioProjects[0].snapshot.referenceImages, [{ url: cdnUrl, label: 'cdn' }])

assert.equal(sanitized.edges.length, 2)
assert.equal(sanitized.edges[0].sourceNode, undefined)
assert.equal(sanitized.edges[0].targetNode, undefined)
assert.equal(sanitized.edges[0].sourceX, undefined)
assert.equal(sanitized.edges[0].targetY, undefined)

const dialogSrc = readFileSync(join(repoRoot, 'src', 'components', 'canvas', 'SaveWorkflowDialog.vue'), 'utf8')
const currentDataSizeBody = dialogSrc.match(/const currentDataSize = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''
const calculateDataSizeBody = dialogSrc.match(/function calculateDataSize\(\) \{[\s\S]*?\n\}/)?.[0] || ''

assert.match(currentDataSizeBody, /exportWorkflowForSave\(\)/, '实时大小显示必须按清理后的保存数据计算')
assert.match(calculateDataSizeBody, /exportWorkflowForSave\(\)/, '保存预检必须按清理后的保存数据计算')
assert.equal(/canvasStore\.exportWorkflow\(\)/.test(currentDataSizeBody), false)
assert.equal(/canvasStore\.exportWorkflow\(\)/.test(calculateDataSizeBody), false)

console.log('workflowSaveSanitizer tests passed')

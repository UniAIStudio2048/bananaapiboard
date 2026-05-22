import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const canvasDir = import.meta.dirname
const assetPanel = readFileSync(join(canvasDir, 'AssetPanel.vue'), 'utf8')
const nodeContextMenu = readFileSync(join(canvasDir, 'NodeContextMenu.vue'), 'utf8')
const seedancePanel = readFileSync(join(canvasDir, 'SeedanceCharacterPanel.vue'), 'utf8')
const videoNode = readFileSync(join(canvasDir, 'nodes/VideoNode.vue'), 'utf8')
const tenantConfig = readFileSync(new URL('../../config/tenant.js', import.meta.url), 'utf8')

test('tenant config exposes a Bytefor character library feature switch', () => {
  assert.match(tenantConfig, /enableByteforCharacterLibrary/)
  assert.match(tenantConfig, /isByteforCharacterLibraryEnabled/)
  assert.match(tenantConfig, /runtimeConfig\.enableByteforCharacterLibrary = false/)
  assert.match(tenantConfig, /config\.enableByteforCharacterLibrary === true/)
})

test('AssetPanel renders Bytefor character library as an independent gated asset type', () => {
  assert.match(assetPanel, /bytefor-character/)
  assert.match(assetPanel, /canvas\.byteforCharacterLib/)
  assert.match(assetPanel, /byteforCharacterLibraryEnabled/)
  assert.match(assetPanel, /selectedType === 'bytefor-character'/)
  assert.match(assetPanel, /key:\s*'bytefor-character'/)
})

test('NodeContextMenu has a Bytefor right-click character creation path gated separately from Seedance', () => {
  assert.match(nodeContextMenu, /byteforCharacterLibraryEnabled/)
  assert.match(nodeContextMenu, /openByteforDialog/)
  assert.match(nodeContextMenu, /createByteforCharacterAsync/)
  assert.match(nodeContextMenu, /'bytefor-character'/)
  assert.match(nodeContextMenu, /创建 Bytefor 角色/)
})

test('NodeContextMenu sends a short explicit FaceCode when creating Bytefor characters', () => {
  assert.match(nodeContextMenu, /function buildByteforFaceCode\(/)
  assert.match(nodeContextMenu, /FaceCode: isBytefor \? buildByteforFaceCode\(name\) : undefined/)
})

test('VideoNode sends Bytefor character nodes to Bytefor models as face codes', () => {
  assert.match(videoNode, /byteforFaceCodes/)
  assert.match(videoNode, /sourceNode\.type === 'bytefor-character'/)
  assert.match(videoNode, /capturedState\.apiType === 'bytefor'/)
  assert.match(videoNode, /formData\.append\('bytefor_face_codes'/)
  assert.match(videoNode, /const previewUrl = getSeedanceCharacterPreviewUrl\(sourceNode\.data\)[\s\S]*?images\.push\(previewUrl\)[\s\S]*?continue/)
  assert.match(videoNode, /finalImages = finalImages\.filter\(u => !byteforCharHttpUrls\.has\(u\)\)/)
})

test('SeedanceCharacterPanel refreshes Bytefor statuses through provider asset list', () => {
  assert.match(
    seedancePanel,
    /async function loadSeedanceCharacterAssets\(/,
    'panel should centralize character asset loading'
  )
  assert.match(
    seedancePanel,
    /if \(isSeedanceOpenApiProProvider\.value\)[\s\S]*?return listVolcAssets\(\{[\s\S]*?providerType: requestedProviderType\.value/,
    'OpenAPI Pro and Bytefor libraries should load the provider-backed asset list so remote approval status is merged by faceCode'
  )
  assert.match(seedancePanel, /const result = await loadSeedanceCharacterAssets\(spaceParams\)/)
})

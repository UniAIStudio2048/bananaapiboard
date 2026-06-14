import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function read(relativePath) {
  return readFileSync(join(__dirname, relativePath), 'utf8')
}

test('director studio media helper persists only image data URLs through canvas media upload', () => {
  const source = read('directorStudioMedia.js')

  assert.match(source, /import\s*\{\s*uploadCanvasMedia\s*\}\s*from\s*['"]@\/api\/canvas\/workflow['"]/)
  assert.match(source, /export\s+function\s+isDirectorDataImageUrl\s*\(\s*value\s*\)\s*\{[\s\S]*typeof\s+value\s*===\s*['"]string['"][\s\S]*\/\^data:image\\\//i)
  assert.match(source, /export\s+async\s+function\s+dataUrlToDirectorFile\s*\(\s*dataUrl,\s*filename\s*=\s*`director-snapshot-\$\{Date\.now\(\)\}\.png`\s*\)/)
  assert.match(source, /const\s+response\s*=\s*await\s+fetch\(dataUrl\)/)
  assert.match(source, /const\s+blob\s*=\s*await\s+response\.blob\(\)/)
  assert.match(source, /return\s+new\s+File\(\[blob\],\s*filename,\s*\{\s*type:\s*blob\.type\s*\|\|\s*['"]image\/png['"]\s*\}\)/)
  assert.match(source, /export\s+async\s+function\s+persistDirectorStudioImageSource\s*\(\s*source\s*\)\s*\{[\s\S]*if\s*\(!isDirectorDataImageUrl\(source\)\)\s*return\s+source[\s\S]*const\s+file\s*=\s*await\s+dataUrlToDirectorFile\(source\)[\s\S]*const\s+result\s*=\s*await\s+uploadCanvasMedia\(file,\s*['"]image['"]\)[\s\S]*return\s+result\.url[\s\S]*\}/)
})

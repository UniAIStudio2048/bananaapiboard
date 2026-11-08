import { readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

// FlowX behavior cases run against the editor modules in this repository.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const directory = new URL('./tests/', import.meta.url)
for (const name of (await readdir(directory)).filter(name => name.endsWith('.test.ts')).sort()) {
  const compiled = await build({
    entryPoints: [new URL(name, directory).pathname], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-test-renderer']
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports)
}

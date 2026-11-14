import { t as translateUi } from '../i18n/index.js'
const MAX_CONCURRENT_POSTERS = 2
const queue = []
let active = 0

function processQueue() {
  while (active < MAX_CONCURRENT_POSTERS && queue.length) {
    const job = queue.shift()
    const { extract, resolve, reject, signal } = job
    job.started = true
    active++
    Promise.resolve().then(() => extract(signal)).then(result => {
      if (!result?.url) throw new Error(translateUi('uiMessages.m6aeb438b8fe3'))
      resolve(result)
    }).catch(reject).finally(() => {
      signal?.removeEventListener('abort', job.onAbort)
      active--
      processQueue()
    })
  }
}

export function requestCanvasVideoPoster(extract, signal) {
  const abortError = () => Object.assign(new Error(translateUi('uiMessages.m7115d47d6985')), { name: 'AbortError' })
  if (signal?.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const job = { extract, resolve, reject, signal, started: false }
    job.onAbort = () => {
      if (job.started) return
      const index = queue.indexOf(job)
      if (index !== -1) queue.splice(index, 1)
      reject(abortError())
    }
    signal?.addEventListener('abort', job.onAbort, { once: true })
    queue.push(job)
    processQueue()
  })
}

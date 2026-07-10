const DATABASE_NAME = 'banana-canvas-uploads'
const DATABASE_VERSION = 1
const STORE_NAME = 'sessions'

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export function createMemoryCanvasUploadCheckpointStore() {
  const values = new Map()
  return {
    async get(fingerprint) {
      return values.has(fingerprint) ? clone(values.get(fingerprint)) : null
    },
    async set(fingerprint, checkpoint) {
      values.set(fingerprint, clone({ ...checkpoint, fingerprint }))
    },
    async delete(fingerprint) {
      values.delete(fingerprint)
    }
  }
}

export function createCanvasUploadCheckpointStore(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl) return createMemoryCanvasUploadCheckpointStore()

  let databasePromise = null
  const openDatabase = () => {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDBImpl.open(DATABASE_NAME, DATABASE_VERSION)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: 'fingerprint' })
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    return databasePromise
  }

  const run = async (mode, action) => {
    const database = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = action(transaction.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }

  return {
    async get(fingerprint) {
      return clone((await run('readonly', store => store.get(fingerprint))) || null)
    },
    async set(fingerprint, checkpoint) {
      await run('readwrite', store => store.put(clone({ ...checkpoint, fingerprint })))
    },
    async delete(fingerprint) {
      await run('readwrite', store => store.delete(fingerprint))
    }
  }
}

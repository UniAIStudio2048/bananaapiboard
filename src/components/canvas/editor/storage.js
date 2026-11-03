// The editor reads its database snapshot synchronously; every write is sent to
// the workflow's versioned writer immediately, without browser storage.
let values = {}
let persist = () => { throw new Error('编辑器数据库尚未连接') }
let flush = async () => {}
let binding = 0

export function bindEditorStorage(snapshot, write, wait = async () => {}) {
  const current = ++binding
  values = { ...snapshot }
  persist = write
  flush = wait
  return () => { if (current !== binding) return; values = {}; persist = () => {}; flush = async () => {} }
}

export const editorStorage = {
  getItem(key) { return values[key] ?? null },
  setItem(key, value) { values = { ...values, [key]: String(value) }; persist({ ...values }) },
  removeItem(key) { const next = { ...values }; delete next[key]; values = next; persist({ ...values }) },
  flush() { return flush() },
  transaction(action) {
    const before = values, write = persist
    persist = () => {}
    try { action(); persist = write; persist({ ...values }) }
    catch (error) { values = before; persist = write; throw error }
  }
}

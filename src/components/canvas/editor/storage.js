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

export function bindAccountEditorStorage(draftSnapshot, account, writeDraft, writePreferences, wait = async () => {}) {
  if (!/^[a-f0-9]{64}$/.test(account.namespace)) throw new Error('剪辑账号尚未确认')
  const prefixes = {
    textPresets: 'media-video-text-presets:v1:media-canvas-preferences:v1:',
    recentStickers: 'media-video-sticker-recent:v1:media-canvas-preferences:v1:',
    timeline: 'media-video-timeline-preferences:v1:media-canvas-preferences:v1:'
  }
  const draft = { ...draftSnapshot }, preferences = { ...account.values }
  for (const [name, prefix] of Object.entries(prefixes)) {
    for (const key of Object.keys(draft)) {
      if (!key.startsWith(prefix)) continue
      if (!(name in preferences)) preferences[name] = draft[key]
      delete draft[key]
    }
  }
  const keys = Object.fromEntries(Object.entries(prefixes).map(([name, prefix]) => [name, prefix + account.namespace]))
  const snapshot = { ...draft, ...Object.fromEntries(Object.entries(preferences).filter(([name]) => keys[name]).map(([name, value]) => [keys[name], value])) }
  const preferenceValue = value => JSON.stringify(Object.keys(prefixes).map(name => value[name] ?? null))
  let lastDraft = JSON.stringify(draft), lastPreferences = preferenceValue(preferences)
  const unbind = bindEditorStorage(snapshot, values => {
    const nextDraft = { ...values }, nextPreferences = {}
    for (const [name, key] of Object.entries(keys)) {
      if (key in nextDraft) nextPreferences[name] = nextDraft[key]
      delete nextDraft[key]
    }
    const draftJson = JSON.stringify(nextDraft), preferencesJson = preferenceValue(nextPreferences)
    if (draftJson !== lastDraft) { writeDraft(nextDraft); lastDraft = draftJson }
    if (preferencesJson !== lastPreferences) { writePreferences(nextPreferences); lastPreferences = preferencesJson }
  }, wait)
  if (lastPreferences !== preferenceValue(account.values)) writePreferences(preferences)
  if (lastDraft !== JSON.stringify(draftSnapshot)) writeDraft(draft)
  return unbind
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

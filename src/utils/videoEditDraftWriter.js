export function createVideoEditDraftWriter(write, onState = () => {}) {
  const queue = []
  let running = null
  let failure = null

  function start() {
    if (running || failure || !queue.length) return
    onState('saving')
    running = (async () => {
      while (queue.length) {
        await write(queue[0])
        queue.shift()
      }
      onState('saved')
    })().catch(error => {
      failure = error
      onState('error', error)
    }).finally(() => { running = null })
  }

  async function flush() {
    while (running) await running
    if (failure) throw failure
  }

  return {
    save(draft) {
      queue.push(JSON.parse(JSON.stringify(draft)))
      start()
    },
    flush,
    async retry() {
      if (failure?.code === 'VERSION_CONFLICT') throw failure
      failure = null
      start()
      await flush()
    }
  }
}

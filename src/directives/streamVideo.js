import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { createStreamVideoPlayback } from '@/utils/streamVideoPlayback'

const controllers = new WeakMap()
async function resolvePlayback(url) {
  const token = localStorage.getItem('token')
  if (!token) return { status: 'original' }
  const response = await fetch(getApiUrl('/api/videos/playback'), {
    method: 'POST',
    headers: { ...getTenantHeaders(), 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(15000)
  })
  return response.ok ? response.json() : { status: 'original' }
}
function attach(el, binding) {
  controllers.get(el)?.destroy()
  const source = binding.value
  if (typeof source !== 'string' || !/^https?:\/\//i.test(source)) return
  el.src = source
  const controller = createStreamVideoPlayback(el, source, { resolve: resolvePlayback })
  controllers.set(el, controller)
  controller.start()
}
export const streamVideo = {
  mounted: attach,
  updated(el, binding) { if (binding.value !== binding.oldValue) attach(el, binding) },
  beforeUnmount(el) { controllers.get(el)?.destroy(); controllers.delete(el) }
}

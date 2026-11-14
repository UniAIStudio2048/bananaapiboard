import * as React from 'react'
import { watchEffect } from 'vue'
import { t as translateUi } from '../../../i18n/index.js'
import { createRoot } from 'react-dom/client'
import { VideoToolEditor } from './VideoToolEditor'
import { EditorProvider } from './context'

export function mountVideoEditor(element: HTMLElement, context: any, props: any) {
  const root = createRoot(element)
  const stop = watchEffect(() => {
    translateUi('common.close')
    root.render(<EditorProvider value={context}><VideoToolEditor {...props} initialMode="edit" /></EditorProvider>)
  })
  return () => { stop(); root.unmount() }
}

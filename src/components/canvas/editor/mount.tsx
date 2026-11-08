import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { VideoToolEditor } from './VideoToolEditor'
import { EditorProvider } from './context'

export function mountVideoEditor(element: HTMLElement, context: any, props: any) {
  const root = createRoot(element)
  root.render(<EditorProvider value={context}><VideoToolEditor {...props} initialMode="edit" /></EditorProvider>)
  return () => root.unmount()
}

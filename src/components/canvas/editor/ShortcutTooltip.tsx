import * as React from 'react'
import { formatShortcut } from './shortcuts'
export function ShortcutTooltip({label, description, shortcut, children}: any) {
  return React.cloneElement(children, { title: [label, shortcut && formatShortcut(shortcut), description].filter(Boolean).join(' · ') })
}

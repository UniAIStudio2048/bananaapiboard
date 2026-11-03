import * as React from 'react'

import type { LucideIcon } from 'lucide-react'
import { ShortcutTooltip } from './ShortcutTooltip'

type TimelineToolButtonProps = {
 label: string
 icon: LucideIcon
 description?: string
 shortcut?: readonly string[]
 disabled?: boolean
 pressed?: boolean
 onClick(): void
}

export function TimelineToolButton({ label, icon: Icon, description, shortcut, disabled, pressed, onClick }: TimelineToolButtonProps) {
 // Disabled buttons swallow pointer events, so the wrapper keeps the tooltip reachable.
 return <ShortcutTooltip label={label} description={description} shortcut={shortcut}><span className={`inline-grid shrink-0 ${disabled ? 'cursor-not-allowed' : ''}`}><button type="button" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={`grid size-7 place-items-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-35 ${pressed ? 'border-white/20 bg-white/15 text-white' : 'border-transparent text-[#dedede] hover:bg-white/10'}`}><Icon size={16} aria-hidden="true" /></button></span></ShortcutTooltip>
}

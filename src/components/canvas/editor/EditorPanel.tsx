import * as React from 'react'
import type { ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'

export const editorPanelClass = 'flex min-h-0 flex-col overflow-hidden rounded-md border border-[#2e2e2e] bg-[#262626]'

export function EditorPanelHeader({ title, compact = false, children }: { title?: ReactNode; compact?: boolean; children?: ReactNode }) {
 return <div className={`flex h-11 w-full shrink-0 items-center justify-between gap-2 border-b border-[#1b1b1b] bg-[#303030] text-[12.64px] text-white ${compact ? 'px-1' : 'pl-4 pr-2'}`}>{title !== undefined && <span className="min-w-0 truncate">{title}</span>}{children}</div>
}

export function EditorEmptyState({ title, description }: { title: string; description: string }) {
 return <div className="grid h-full content-center justify-items-center gap-2 px-6 text-center">
  <SlidersHorizontal aria-hidden="true" strokeWidth={1.5} className="mb-2 size-10 text-[#7a7a7a]/75" />
  <p className="text-lg font-medium text-[#dedede]">{title}</p>
  <p className="text-balance text-[12.64px] text-[#7a7a7a]">{description}</p>
 </div>
}

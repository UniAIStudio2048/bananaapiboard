import * as React from 'react'
import { blendModes, type BlendMode } from './blend-mode'

export function BlendModeSelect({value,disabled,onChange}:{value?:BlendMode;disabled:boolean;onChange(value:BlendMode):void}) {
 return <label className="grid gap-1 text-xs text-zinc-300">混合模式<select aria-label="混合模式" className="w-full rounded-lg border border-white/15 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100" value={value??'normal'} disabled={disabled} onChange={event=>onChange(event.target.value as BlendMode)}>{blendModes.map(([mode,label])=><option className="bg-white text-[#111827]" key={mode} value={mode}>{label}</option>)}</select></label>
}

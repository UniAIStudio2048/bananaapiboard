import { t as translateUi } from '../../../i18n/index.js'
import * as React from 'react'

import { useEffect, useRef, useState } from 'react'

export function EditableTimecode({display,fps,duration,disabled,onSeek}:{display:string;fps:number;duration:number;disabled:boolean;onSeek(time:number):void}) {
 const [editing,setEditing]=useState(false),[value,setValue]=useState(''),[invalid,setInvalid]=useState(false)
 const input=useRef<HTMLInputElement>(null),handled=useRef(false)
 useEffect(()=>{if(editing){input.current?.focus();input.current?.select()}},[editing])
 function begin(){if(disabled)return;handled.current=false;setValue(display);setInvalid(false);setEditing(true)}
 function commit(){
  const parts=value.trim().split(':')
  if(parts.length!==4||parts.some(part=>!/^\d{1,6}$/.test(part))){setInvalid(true);return}
  const [hours,minutes,seconds,frames]=parts.map(Number)
  if(minutes>=60||seconds>=60||frames>=fps){setInvalid(true);return}
  handled.current=true;onSeek(Math.min(duration,hours*3600+minutes*60+seconds+frames/fps));setEditing(false);setInvalid(false)
 }
 function cancel(){handled.current=true;setEditing(false);setInvalid(false)}
 if(!editing)return <button type="button" aria-label={translateUi('uiMessages.ma743246d8d82')} title={translateUi('uiMessages.m9b1bf3829251')} disabled={disabled} onClick={begin} className="rounded text-[var(--mf-brand)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mf-brand)] disabled:cursor-not-allowed disabled:opacity-50">{display}</button>
 return <input ref={input} aria-label={translateUi('uiMessages.m958054767825')} aria-invalid={invalid} title={translateUi('uiMessages.m40308d46661e')} type="text" value={value} onChange={event=>{setValue(event.target.value);setInvalid(false)}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit()}else if(event.key==='Escape'){event.preventDefault();cancel()}}} onBlur={()=>{if(!handled.current)commit()}} className={`w-[11ch] rounded border bg-transparent text-[8px] outline-none lg:w-[12ch] lg:text-xs ${invalid?'border-red-400 text-red-300':'border-[var(--mf-brand)] text-[var(--mf-brand)]'}`} />
}

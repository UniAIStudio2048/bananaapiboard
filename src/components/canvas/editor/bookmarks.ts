export interface TimelineBookmark { id:string; time:number; note?:string; color?:string; duration?:number }
const epsilon=.001
export function validBookmark(value:unknown):value is TimelineBookmark {
 if(!value || typeof value!=='object')return false
 const item=value as TimelineBookmark
 return typeof item.id==='string' && item.id.length>0 && item.id.length<=100 && Number.isFinite(item.time) && item.time>=0 && item.time<=600 && (item.note===undefined || (typeof item.note==='string' && item.note.length<=4096)) && (item.color===undefined || (typeof item.color==='string' && /^#[0-9a-f]{6}$/i.test(item.color))) && (item.duration===undefined || (Number.isFinite(item.duration) && item.duration>=0 && item.duration<=600))
}
export function toggleBookmark(items:TimelineBookmark[],time:number,id:string):TimelineBookmark[] {
 const index=items.findIndex(item=>Math.abs(item.time-time)<epsilon)
 return index>=0?items.filter((_,i)=>i!==index):[...items,{id,time}].sort((a,b)=>a.time-b.time)
}
export function moveBookmark(items:TimelineBookmark[],id:string,time:number):TimelineBookmark[] {
 const current=items.find(item=>item.id===id);if(!current||Math.abs(current.time-time)<epsilon)return items
 return items.map(item=>item.id===id?{...item,time}:item).sort((a,b)=>a.time-b.time)
}
export function changeBookmark(items:TimelineBookmark[],id:string,change:Partial<Pick<TimelineBookmark,'note'|'color'|'duration'>>):TimelineBookmark[] {
 const current=items.find(item=>item.id===id);if(!current||Object.entries(change).every(([key,value])=>current[key as keyof TimelineBookmark]===value))return items
 return items.map(item=>item.id===id?{...item,...change}:item)
}
export function visibleBookmarkNotes(items:TimelineBookmark[],time:number):TimelineBookmark[] {
 return items.filter(item=>Boolean(item.note?.trim()) && time>=item.time-epsilon && time<=item.time+(item.duration??0)+epsilon)
}

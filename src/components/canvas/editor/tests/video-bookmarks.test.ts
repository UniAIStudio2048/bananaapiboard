import assert from 'node:assert/strict'
import test from 'node:test'
import { changeBookmark, moveBookmark, toggleBookmark, validBookmark, visibleBookmarkNotes } from '../bookmarks'
import { snapTime, timelineSnapTargets } from '../timeline-snap'

test('bookmark edits preserve metadata and toggle by frame time',()=>{
 let items=toggleBookmark([],1,'a')
 items=changeBookmark(items,'a',{note:'提醒',color:'#12aBcD',duration:2})
 items=toggleBookmark(items,3,'b')
 assert.equal(items.length,2)
 assert.deepEqual(visibleBookmarkNotes(items,2).map(item=>item.note),['提醒'])
 assert.equal(visibleBookmarkNotes(items,3.1).length,0)
 const moved=moveBookmark(items,'a',2)
 assert.equal(moved[0].time,2);assert.equal(moved[0].note,'提醒');assert.equal(moved[0].duration,2)
 assert.equal(moveBookmark(moved,'a',2),moved)
 assert.equal(toggleBookmark(moved,2.0004,'ignored').length,1)
})

test('bookmarks are validated and included in snap targets without entering media input',()=>{
 assert.ok(validBookmark({id:'x',time:2,note:'note',color:'#00aaff',duration:1}))
 for(const value of [null,{id:'',time:2},{id:'x',time:-1},{id:'x',time:2,color:'red'},{id:'x',time:2,duration:-1},{id:'x',time:Infinity}])assert.equal(validBookmark(value),false)
 const marks=[{id:'one',time:1.25},{id:'two',time:3}]
 const targets=timelineSnapTargets([],[],[],[],[],[],0,'video',-1,marks)
 assert.ok(targets.includes(1.25));assert.equal(snapTime(1.2,targets,.1),1.25)
 const withoutPlayhead=timelineSnapTargets([],[],[],[],[],[],2.5,'video',-1,marks,false)
 assert.ok(!withoutPlayhead.includes(2.5));assert.ok(withoutPlayhead.includes(1.25))
 assert.equal(snapTime(1.2,targets,.01),1.2)
})

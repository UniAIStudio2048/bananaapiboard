import assert from 'node:assert/strict'
import test from 'node:test'
import { adjacentEditPoint, editorShortcuts, formatShortcut } from '../shortcuts'

test('shortcuts render with platform modifiers',()=>{
 assert.equal(formatShortcut(editorShortcuts.split,true),'⌘B')
 assert.equal(formatShortcut(editorShortcuts.split,false),'Ctrl+B')
 assert.equal(formatShortcut(editorShortcuts.redo,true),'⇧⌘Z')
 assert.equal(formatShortcut(editorShortcuts.redo,false),'Shift+Ctrl+Z')
 assert.equal(formatShortcut(editorShortcuts.playPause,false),'空格')
 assert.equal(formatShortcut(editorShortcuts.delete,true),'⌫')
})

test('edit points step to the neighbouring boundary',()=>{
 const points=[0,2,2,5]
 assert.equal(adjacentEditPoint(points,1,1),2)
 assert.equal(adjacentEditPoint(points,2,1),5)
 assert.equal(adjacentEditPoint(points,2,-1),0)
 assert.equal(adjacentEditPoint(points,5,1),undefined)
 assert.equal(adjacentEditPoint(points,0,-1),undefined)
})

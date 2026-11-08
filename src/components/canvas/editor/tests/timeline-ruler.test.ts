import assert from 'node:assert/strict'
import test from 'node:test'
import { rulerLabel, rulerStep, rulerTicks } from '../timeline-ruler'

test('ruler labels whole seconds as mm:ss and other ticks as frames',()=>{
 assert.equal(rulerLabel(0,30),'00:00')
 assert.equal(rulerLabel(.5,30),'15f')
 assert.equal(rulerLabel(65,30),'01:05')
 assert.equal(rulerLabel(1+10/30,30),'10f')
})

test('ruler step keeps labels apart and on second boundaries',()=>{
 assert.equal(rulerStep(120,30),1)
 assert.equal(rulerStep(480,30),5/30)
 assert.equal(rulerStep(240,30),10/30)
 assert.equal(rulerStep(480,25),5/25)
 assert.equal(rulerStep(480,24),1)
 assert.equal(rulerStep(12,30),10)
})

test('ruler ticks cover the timeline extent',()=>{
 assert.deepEqual(rulerTicks(2,120,30).map(tick=>tick.label),['00:00','00:01','00:02'])
 assert.deepEqual(rulerTicks(1,240,30).map(tick=>tick.label),['00:00','10f','20f','00:01'])
})

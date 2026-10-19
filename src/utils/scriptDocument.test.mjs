import test from 'node:test'
import assert from 'node:assert/strict'
import { blankScript, newShot, autoCompose, scriptCsv, completion, assetPrompt } from './scriptDocument.js'
test('all three steps require real content', () => {
 const d = blankScript(); assert.equal(completion(d), 0)
 d.shots.push(newShot('s')); d.confirmed = true; d.assets.push({ id:'a', type:'prop', name:'印章', imageUrl:'' })
 assert.equal(completion(d), 1); d.assets[0].imageUrl='https://example/a'; assert.equal(completion(d),2)
 const next = autoCompose(d,['s']); assert.equal(completion(next),3); assert.equal(d.shots[0].imagePrompt,'')
})
test('CSV quotes newlines and prevents spreadsheet formula injection', () => {
 const d = blankScript(); d.shots.push({...newShot('s'),description:'=HYPERLINK("x")\n甲,乙'});
 assert.match(scriptCsv(d), /'=HYPERLINK/); assert.match(scriptCsv(d), /视频运动提示词/)
})
test('asset prompt honors style and meaningful prop text', () => {
 assert.match(assetPrompt({type:'prop',description:'写着1120的账本'},'二维动画'), /1120/)
 assert.match(assetPrompt({type:'character',description:'人物'},'二维动画'), /二维动画/)
})

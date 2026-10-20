'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Strategy}=require('../overlay/src/strategy');
const M=require('../overlay/vendor/coffeebns/model-core.cjs');
const S=require('../overlay/vendor/coffeebns/js/solver');
const choose=require('../overlay/vendor/coffeebns/recommend-core.cjs');
const {describe}=require('../overlay/src/strategy/labels');
const fixture=require('./fixtures/upstream-board.json');
test('background Solver matches upstream policy and ranks, reuses worker and keeps event loop responsive',async t=>{
  const strategy=new Strategy();t.after(()=>strategy.dispose());
  let ticks=0,maxLag=0,last=performance.now();const timer=setInterval(()=>{const now=performance.now();maxLag=Math.max(maxLag,now-last);last=now;ticks++;},10);t.after(()=>clearInterval(timer));
  const {st}=M.buildState(fixture.model);
  for(let i=0;i<10;i++){
    const r=await strategy.recommend({...fixture,revision:String(i)});
    assert.equal(r.status,'ready');assert.equal(r.revision,String(i));
    assert.ok(S.candidates(st).some(c=>S.sameAction(c.action,r.action)));
    const expected=choose({st,instant:S.instant(st),result:r.raw.result});assert.deepEqual(r.action,expected.action);
    assert.ok(r.message.includes('第 '));assert.equal(r.provisional,false);
  }
  assert.equal(strategy.starts,1);assert.ok(ticks>50);assert.ok(maxLag<500,`main thread heartbeat ${maxLag}ms`);
  console.log(`Solver 10 jobs: 1 worker, heartbeat max ${maxLag.toFixed(1)}ms`);
});
test('uncertainty, invalid state, cancellation, supersession and recovery',async t=>{
  const strategy=new Strategy();t.after(()=>strategy.dispose());
  for(const checks of [['warden'],['dest']])assert.equal((await strategy.recommend({...fixture,checks})).status,'blocked');
  const invalid=structuredClone(fixture);invalid.model.dest=[];assert.equal((await strategy.recommend(invalid)).status,'blocked');
  const event=structuredClone(fixture);event.model.step='event';event.model.eventKind='unknown';assert.equal((await strategy.recommend(event)).status,'blocked');
  const old=strategy.recommend({...fixture,revision:'old'}),current=strategy.recommend({...fixture,checks:['vault','objective'],revision:'new'});
  assert.equal((await old).status,'cancelled');const r=await current;
  assert.equal(r.revision,'new');assert.equal(r.status,'ready');assert.equal(r.provisional,true);assert.equal(r.pending,2);
  const stop=strategy.recommend(fixture);strategy.cancel();assert.equal((await stop).status,'cancelled');
  assert.equal((await strategy.recommend(fixture)).status,'ready');assert.equal(strategy.starts,1);
});
test('all upstream phases and action labels remain compatible',async t=>{
  const strategy=new Strategy();t.after(()=>strategy.dispose());
  const models=[];
  for(const step of ['patrol','manage','ratway','choice','office','event','chain']){
    const m=structuredClone(fixture.model);m.step=step;
    if(step==='office')m.warden=0;
    if(['manage','chain','event'].includes(step)){m.warden=1;m.cells[1]={kind:'inmate',beast:'wolf',tier:1};m.cells[2]={kind:'inmate',beast:'rat',tier:1};}
    if(step==='event')m.eventKind='portion';
    if(step==='choice')m.choice={kind:'tool',options:['saw','keys','rope'],rerolls:1};
    models.push(m);
  }
  for(const model of models){
    const built=M.buildState(model);assert.deepEqual(built.problems,[],model.step);
    const r=await strategy.recommend({model,checks:[],revision:model.step});assert.equal(r.status,'ready',JSON.stringify(r));
    assert.ok(S.candidates(built.st).some(c=>S.sameAction(c.action,r.action)),model.step);
  }
  for(const action of [{type:'patrol',cell:1},{type:'devour',to:2},{type:'chain',to:2},{type:'hunt',to:2},{type:'swap'},{type:'end'},{type:'stopchain'},{type:'office',choice:'bestow'},{type:'office',choice:'instigate'},{type:'event',accept:true},{type:'event',accept:false},{type:'choose',id:'ring'},{type:'choose',id:'rope'},{type:'reroll'}]){
    const text=describe(action,fixture.model);assert.doesNotMatch(text,/undefined|沒有可顯示/);assert.match(text,/[\u4e00-\u9fff]/);
  }
});

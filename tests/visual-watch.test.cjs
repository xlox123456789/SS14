'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {VisualWatch}=require('../overlay/src/auto/visual-watch');
test('decision-row change is stable, deduplicated, busy-safe and stopped with manual mode',async()=>{
  let sample=Array(512).fill(40),calls=0,starts=0,stops=0,busy=false;
  const capture={startProbe:async()=>{starts++;},stopProbe:()=>{stops++;},probe:async()=>sample};
  const watch=new VisualWatch({capture,busy:()=>busy,onChange:()=>calls++,onError:e=>{throw e;},interval:100000});
  try{
    await watch.start({id:'window:1:0',title:'game'});await watch.tick();assert.equal(calls,0);
    sample=Array(512).fill(42);await watch.tick();assert.equal(calls,0,'minor animation ignored');
    sample=Array(512).fill(100);await watch.tick();assert.equal(calls,0,'wait for stable picture');
    await watch.tick();assert.equal(calls,1);await watch.tick();assert.equal(calls,1,'no repeated screenshots');
    busy=true;sample=Array(512).fill(160);await watch.tick();assert.equal(calls,1);
    busy=false;await watch.tick();await watch.tick();assert.equal(calls,2,'new change after current job');
    await watch.start({id:'window:1:0',title:'game'});assert.equal(starts,1);
    watch.stop();await watch.tick();assert.equal(calls,2);assert.ok(stops>0);assert.equal(watch.timer,null);
  }finally{watch.stop();}
});

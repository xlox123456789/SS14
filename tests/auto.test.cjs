'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { AutoService } = require('../overlay/src/auto/service');
const wait = ms => new Promise(r => setTimeout(r,ms));
async function until(predicate, timeout = 7000) { const start=Date.now(); while (!predicate()) { if (Date.now()-start>timeout) throw new Error('Auto replay timeout'); await wait(50); } }
test('replay upstream trigger names: tail-only, burst, duplicate, skip, rotation, bounded retry and stop', async t => {
  const root = path.resolve(__dirname,'.runs'); fs.mkdirSync(root,{recursive:true});
  const folder = fs.mkdtempSync(path.join(root,'auto-')), log = path.join(folder,'UE_game.log');
  // Constructed replay lines matching upstream rules, NOT a real gameplay recording.
  const line = (stamp, body) => `[${stamp}] TLLua: ${body}\n`;
  fs.writeFileSync(log,line('old','UI_S16_Card_Up'));
  const calls=[]; let captureFail=false;
  const service = new AutoService({ analyze:async kind => { calls.push(kind); return captureFail ? {ok:false,stage:'capture',error:'測試擷取失敗'} : {ok:true}; },busy:()=>false,remember:()=>{} });
  t.after(() => { service.dispose(); if (path.resolve(folder).startsWith(root+path.sep)) fs.rmSync(folder,{recursive:true,force:true}); });
  const settings={analysisMode:'auto',autoConsent:true,logPath:log,targetWindow:{id:'window:1:0',title:'測試目標'}};
  service.configure(settings); await until(()=>service.snapshot().status==='monitoring');
  await wait(1700); assert.equal(calls.length,0,'existing log must not replay');
  fs.appendFileSync(log,line('unrelated','Something Else')); await wait(1200); assert.equal(calls.length,0);
  const hit=line('one','UI_S16_Card_Up'); fs.appendFileSync(log,hit+hit+line('two','UI_S16_Click_Cancel'));
  await until(()=>calls.length===1); assert.equal(service.snapshot().events,2,'duplicate timestamp ignored');
  await wait(1500); assert.equal(calls.length,1,'no continuous screenshots');
  fs.appendFileSync(log,line('three','UI_S16_Card_Up')+line('four','S16BoardNewDayPop Run'));
  await wait(2800); assert.equal(calls.length,1,'new day banner cancels pending frame');
  fs.appendFileSync(log,line('five','UI_S16_Card_Up')+line('six','[S16LastDay] check cur=20 max=0'));
  await until(()=>service.snapshot().progress==='SS14結算畫面'); await wait(1700); assert.equal(calls.length,1);
  fs.unlinkSync(log); await until(()=>service.snapshot().status==='waiting');
  fs.writeFileSync(log,line('seven','UI_S16_Card_Up')); await until(()=>calls.length===2);
  fs.writeFileSync(log,line('eight','UI_S16_Card_Up')); await until(()=>calls.length===3);
  captureFail=true; fs.appendFileSync(log,line('nine','UI_S16_Card_Up')); await until(()=>calls.length===5,10000);
  await wait(2000); assert.equal(calls.length,5,'capture failures retry only once');
  service.configure({...settings,analysisMode:'manual'}); assert.equal(service.snapshot().status,'manual');
  fs.appendFileSync(log,line('ten','UI_S16_Card_Up')); await wait(2800); assert.equal(calls.length,5);
  assert.equal(service.timer,null); assert.equal(service.follow,null);
});

test('busy jobs keep the latest stage, recover after errors and survive mode changes during a job',async t=>{
  const root=path.resolve(__dirname,'.runs');fs.mkdirSync(root,{recursive:true});const folder=fs.mkdtempSync(path.join(root,'queue-'));const log=path.join(folder,'UE_game.log');fs.writeFileSync(log,'');
  let release,calls=[],concurrent=0,maxConcurrent=0;
  const service=new AutoService({busy:()=>false,remember:()=>{},analyze:kind=>{calls.push(kind);concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);return new Promise(resolve=>{release=result=>{concurrent--;resolve(result);};});}});
  t.after(()=>{service.dispose();if(folder.startsWith(root+path.sep))fs.rmSync(folder,{recursive:true,force:true});});
  const settings={analysisMode:'auto',autoConsent:true,logPath:log,targetWindow:{id:'window:1:0',title:'測試'}};
  service.configure(settings);await until(()=>service.snapshot().status==='monitoring');
  const epoch=service.epoch;service.dispatch(epoch,0,'board');await until(()=>calls.length===1);
  service.dispatch(epoch,0,'objective');service.dispatch(epoch,0,'instruments');
  release({ok:true});await until(()=>calls.length===2);assert.deepEqual(calls,['board','instruments']);
  release({ok:false,stage:'scan',error:'辨識失敗'});await until(()=>!service.running);assert.equal(service.snapshot().status,'monitoring');
  service.dispatch(epoch,0,'board');await until(()=>calls.length===3);
  service.configure({...settings,analysisMode:'manual'});service.configure(settings);
  service.dispatch(service.epoch,0,'objective');release({ok:true});await until(()=>calls.length===4);
  release({ok:true});await until(()=>!service.running);assert.equal(maxConcurrent,1);assert.equal(service.pendingJob,null);
});

test('confirmed real Page@ stage lines match supplemental rules; upstream rules alone miss them',()=>{
  const create=require('../overlay/vendor/coffeebns/auto-core.cjs');const {PAGE_RULES}=require('../overlay/src/auto/log-rules');
  const core=create({emit:()=>{},setState:()=>{},grab:()=>null});
  const lines=fs.readFileSync(path.join(__dirname,'fixtures/real-stage-events.log'),'utf8').trim().split('\n');
  assert.ok(lines.length>=5);assert.equal(lines.filter(l=>core.rules().some(r=>r.re.test(l))).length,0);
  for(const line of lines)assert.ok(PAGE_RULES.some(r=>new RegExp(r.pattern).test(line)),line);
  assert.ok(lines.filter(l=>PAGE_RULES.some(r=>r.kind==='board'&&new RegExp(r.pattern).test(l))).length>=5);
  core.stop();
});

'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.resolve('tests/.runs');fs.mkdirSync(output,{recursive:true});const run=fs.mkdtempSync(path.join(output,'reliability-'));
const profile=path.join(run,'app'),log=path.join(run,'UE_game.log');fs.mkdirSync(profile);fs.writeFileSync(log,'');
const executablePath=path.resolve('overlay/node_modules/electron/dist/electron.exe');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const wait=ms=>new Promise(r=>setTimeout(r,ms));let app,target,overlay,settings;
async function state(){return (await overlay.evaluate(()=>window.overlayApp.getState())).value;}
async function until(predicate,timeout=30000){const start=Date.now();for(;;){const s=await state();if(predicate(s))return s;if(Date.now()-start>timeout)throw new Error(`Timeout: ${JSON.stringify({analysis:s.analysis,auto:s.auto})}`);await wait(80);}}
async function launchTarget(){const instance=await _electron.launch({executablePath,args:[path.resolve('tests/fixtures/image-target.cjs'),`--image=${path.resolve('.research/perf-input.png')}`],env});await(await instance.firstWindow()).waitForLoadState();return instance;}
(async()=>{
try{
  target=await launchTarget();
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({schemaVersion:1,opacity:1,alwaysOnTop:true,showOnStartup:true,captureShortcut:'F9',targetWindow:null,position:null,analysisMode:'manual',autoConsent:false,logPath:''}));
  app=await _electron.launch({executablePath,args:[path.resolve('overlay'),`--user-data=${profile}`],env});
  for(let i=0;i<100;i++){overlay=app.windows().find(p=>p.url().includes('/overlay/index.html'));if(overlay)break;await wait(50);}await overlay.waitForLoadState();
  await overlay.locator('#settings').click();
  for(let i=0;i<100;i++){settings=app.windows().find(p=>p.url().includes('/settings/index.html'));if(settings)break;await wait(50);}await settings.waitForLoadState();
  const windows=(await overlay.evaluate(()=>window.overlayApp.listWindows())).value;const selected=windows.find(w=>w.title==='效能量測視窗');assert.ok(selected);
  assert.equal((await overlay.evaluate(targetWindow=>window.overlayApp.saveSettings({targetWindow}),selected)).ok,true);
  // Real DOM click: immediate feedback, window stays visible, UI usable during scan.
  const clickedAt=performance.now();await overlay.locator('#capture').click();
  assert.match(await overlay.locator('#capture-status').textContent(),/正在截圖|正在辨識/);
  const feedbackMs=performance.now()-clickedAt;
  const interactions=[];
  for(let i=0;i<12;i++){
    const start=performance.now();await settings.locator('#opacity').fill(String(70+i));
    await app.evaluate(({BrowserWindow},i)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/overlay/index.html'));if(!w.isVisible())throw new Error('Overlay hidden during analysis');w.setPosition(1100+i,120+i);},i);
    interactions.push(performance.now()-start);
  }
  await until(s=>s.analysis.status==='success');let previous=(await overlay.evaluate(()=>window.overlayApp.getBoard())).value.revision;
  console.log('PASS actual button click, immediate feedback, UI stays visible and interactive during worker analysis.');
  // Exercise the callback actually registered with Electron, not a separate analysis route.
  await app.evaluate(({globalShortcut})=>{const original=globalShortcut.register.bind(globalShortcut);globalShortcut.register=(key,callback)=>{if(key==='F9')globalThis.__f9Callback=callback;return original(key,callback);};});
  assert.equal((await overlay.evaluate(()=>window.overlayApp.saveSettings({captureShortcut:'Control+Shift+F11'}))).ok,true);
  assert.equal((await overlay.evaluate(()=>window.overlayApp.saveSettings({captureShortcut:'F9'}))).ok,true);
  await app.evaluate(()=>globalThis.__f9Callback());
  await until(s=>s.analysis.status==='success'&&s.analysis.revision!==previous);previous=(await state()).analysis.revision;
  // Five original, real recorded Page@ events. Fixed real screenshot as input;
  // this verifies delivery/update, not five different gameplay board truths.
  const lines=fs.readFileSync('tests/fixtures/real-stage-events.log','utf8').trim().split('\n').filter(l=>!/OpenView S16BoardNewDayPop/.test(l)).slice(0,5);assert.equal(lines.length,5);
  assert.equal((await overlay.evaluate(logPath=>window.overlayApp.saveSettings({analysisMode:'auto',autoConsent:true,logPath}),log)).ok,true);
  await until(s=>s.auto.status==='monitoring');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/settings/index.html')).close());
  const revisions=[];
  for(let i=0;i<lines.length;i++){
    fs.appendFileSync(log,lines[i]+'\n');const s=await until(s=>s.auto.captures===i+1&&s.analysis.status==='success');
    assert.notEqual(s.analysis.revision,previous);previous=s.analysis.revision;revisions.push(previous);
    const advised=await until(s=>s.advice.status==='ready'&&s.advice.revision===previous);
    assert.ok(advised.advice.action);
    await overlay.waitForFunction(expected=>document.getElementById('advice-move').textContent===expected,advised.advice.message);
    console.log(`PASS real Log stage ${i+1}: capture -> upstream recognition -> new board revision -> Solver -> overlay advice`);
  }
  assert.equal(new Set(revisions).size,5);
  // While working, a newer stage must be retained and processed afterwards.
  fs.appendFileSync(log,lines[0].replace('05.54.58:289','05.54.58:290')+'\n');
  await until(s=>s.analysis.status==='busy');
  fs.appendFileSync(log,lines[1].replace('05.54.59:240','05.54.59:241')+'\n');
  await until(s=>s.auto.captures===7&&s.analysis.status==='success',45000);
  // Native game-window restart: fail once, re-open under the same title, recover.
  await overlay.evaluate(()=>window.overlayApp.saveSettings({analysisMode:'manual'}));
  await target.close();target=null;
  const failed=await overlay.evaluate(()=>window.overlayApp.analyzeCapture());assert.equal(failed.ok,false);assert.match(failed.error,/找不到選定/);
  target=await launchTarget();const recovered=await overlay.evaluate(()=>window.overlayApp.analyzeCapture());assert.equal(recovered.ok,true);
  await overlay.evaluate(()=>window.overlayApp.saveSettings({analysisMode:'auto'}));await until(s=>s.auto.status==='monitoring');
  const count=(await state()).auto.captures;
  fs.unlinkSync(log);await until(s=>s.auto.status==='waiting');fs.writeFileSync(log,lines[2]+'\n');
  await until(s=>s.auto.captures===count+1&&s.analysis.status==='success');
  await until(s=>s.advice.status!=='busy');await wait(500);
  const cpuStart=await app.evaluate(()=>({cpu:process.cpuUsage(),rss:process.memoryUsage().rss}));await wait(10000);
  const idle=await app.evaluate((_,start)=>{const cpu=process.cpuUsage(start.cpu);return {cpuMs:(cpu.user+cpu.system)/1000,rssDeltaMB:(process.memoryUsage().rss-start.rss)/1048576};},cpuStart);
  const diag=(await overlay.evaluate(()=>window.overlayApp.getDiagnostics())).value;assert.equal(diag.metrics.workerStarts,1);assert.equal(diag.jobState,'Monitoring');
  await overlay.evaluate(()=>window.overlayApp.openSettings());await settings.locator('#diagnostics > summary').click();await settings.locator('#copy-diagnostics').click();
  assert.equal(await app.evaluate(async({clipboard})=>JSON.parse(await clipboard.readText()).jobState),'Monitoring');
  const records=fs.readFileSync(path.join(profile,'logs/diagnostics.log'),'utf8').split('\n').filter(Boolean).map(JSON.parse);
  for(const stage of ['ipc.analysis.click','analysis.request','capture.start','capture.complete','scan.start','scan.complete','analysis.complete','log.event'])assert.ok(records.some(r=>r.stage===stage),stage);
  assert.ok(records.some(r=>r.stage==='analysis.request'&&r.source==='hotkey'));
  let physicalF9='registered callback tested; physical OS key is separate';
  if(process.argv.includes('--native')){
    const before=(await state()).capture.last.id;
    await target.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});
    console.log('READY_NATIVE_F9: focused 效能量測視窗; send actual F9 now.');
    try{await until(s=>s.capture.last?.id!==before&&s.analysis.status==='success',35000);physicalF9='PASS physical OS F9';console.log('PASS physical Windows F9 -> capture -> recognition -> board update');}
    catch{physicalF9='NOT VERIFIED: OS automation could not deliver F9';console.log(physicalF9);}
  }
  const result={feedbackMs,interactionMaxMs:Math.max(...interactions),fiveRealStages:revisions.length,workerStarts:diag.metrics.workerStarts,idle10Seconds:idle,physicalF9,stageTimes:{captureMs:records.filter(r=>r.stage==='capture.complete').map(r=>r.durationMs),scanMs:records.filter(r=>r.stage==='scan.complete').map(r=>r.durationMs)},fixedImage:'actual game screenshot, not live changing boards'};
  fs.writeFileSync(path.join(output,'reliability.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  console.log('PASS queued stages, settings closed monitoring, failure recovery, restarted native target, rotated Log, copied diagnostics, single worker.');
}finally{await app?.close().catch(()=>{});await target?.close().catch(()=>{});if(path.resolve(run).startsWith(output+path.sep))fs.rmSync(run,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});

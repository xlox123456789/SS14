'use strict';
// Real native window and real capture. Colored regions test change delivery,
// not board recognition accuracy or gameplay.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const run=path.resolve('tests/.runs/visual');fs.mkdirSync(run,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app,target;
(async()=>{try{
  target=await _electron.launch({executablePath:path.resolve('overlay/node_modules/electron/dist/electron.exe'),args:[path.resolve('tests/fixtures/capture-target.cjs')],env});
  app=await _electron.launch({executablePath:path.resolve('overlay/node_modules/electron/dist/electron.exe'),args:[path.resolve('tests/fixtures/capture-target.cjs')],env});
  const page=await target.firstWindow();await page.waitForLoadState();
  await app.evaluate(async({BrowserWindow},root)=>{
    const load=process.getBuiltinModule('node:module').createRequire(root+'/overlay/main.js');
    const {CaptureService}=load(root+'/overlay/src/capture/service');
    const {VisualWatch}=load(root+'/overlay/src/auto/visual-watch');
    globalThis.__visualCalls=0;globalThis.__visualErrors=[];globalThis.__visualBusy=false;
    const c=globalThis.__visualCapture=new CaptureService({folder:root+'/tests/.runs/visual/captures'});
    const w=(await c.listWindows()).find(w=>w.title==='浮層截圖測試視窗');if(!w)throw new Error('Missing native fixture');globalThis.__visualTarget=w;
    globalThis.__visualWatch=new VisualWatch({capture:c,busy:()=>__visualBusy,onChange:()=>{__visualCalls++;},onError:e=>__visualErrors.push(e.message)});
    await __visualWatch.start(w);
  },process.cwd());
  await page.evaluate(()=>{document.body.style.background='#eee';document.body.innerHTML='<div style="position:fixed;inset:61% 27% 10%;background:white"></div>';});
  await page.waitForFunction(()=>true);await new Promise(r=>setTimeout(r,3000));
  assert.equal(await app.evaluate(()=>__visualCalls),1);
  await new Promise(r=>setTimeout(r,1600));assert.equal(await app.evaluate(()=>__visualCalls),1,'static frame must not re-trigger');
  const changedAt=performance.now();await page.evaluate(()=>{document.querySelector('div').style.background='black';});
  while(await app.evaluate(()=>__visualCalls)!==2){if(performance.now()-changedAt>2500)throw new Error('Decision change detection timeout');await new Promise(r=>setTimeout(r,25));}
  console.log(`Native visual change latency: ${Math.round(performance.now()-changedAt)}ms (100ms sampling, stable frame gate).`);
  const shot=await app.evaluate(()=>__visualCapture.take(__visualTarget));assert.ok(shot.width>0);assert.equal(shot.sourceTitle,'浮層截圖測試視窗');
  await app.evaluate(()=>__visualWatch.stop());
  await page.evaluate(()=>{document.querySelector('div').style.background='white';});
  await new Promise(r=>setTimeout(r,1600));assert.equal(await app.evaluate(()=>__visualCalls),2);
  assert.deepEqual(await app.evaluate(()=>__visualErrors),[]);
  console.log('PASS native decision-region changes trigger twice; static frames deduplicate; stop releases stream and prevents triggers. No gameplay/recognition accuracy claim.');
}finally{if(app){await app.evaluate(()=>{globalThis.__visualWatch?.stop();globalThis.__visualCapture?.dispose();}).catch(()=>{});await app.close();}await target?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

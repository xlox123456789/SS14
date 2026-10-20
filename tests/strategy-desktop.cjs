'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.resolve('tests/.runs');fs.mkdirSync(output,{recursive:true});
const run=fs.mkdtempSync(path.join(output,'strategy-')),profile=path.join(run,'app');fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({schemaVersion:1,opacity:1,alwaysOnTop:true,position:null,targetWindow:null,autoConsent:false,logPath:'',analysisMode:'manual',captureShortcut:'Control+Shift+F8',showOnStartup:true}));
fs.copyFileSync('tests/fixtures/upstream-board.json',path.join(profile,'board.json'));
const {BoardStore}=require('../overlay/src/board/store');new BoardStore(path.join(profile,'board.json')).save({...require('./fixtures/upstream-board.json'),checks:[]});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
  app=await _electron.launch({executablePath:path.resolve('overlay/node_modules/electron/dist/electron.exe'),args:[path.resolve('overlay'),`--user-data=${profile}`],env});
  app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
  let overlay;for(let i=0;i<100;i++){overlay=app.windows().find(p=>p.url().includes('/overlay/index.html'));if(overlay)break;await wait(50);}await overlay.waitForLoadState();
  assert.match(await overlay.locator('#advice-move').textContent(),/上次盤面|等待盤面/);
  await overlay.locator('#board').click();
  let board;for(let i=0;i<100;i++){board=app.windows().find(p=>p.url().includes('/board/index.html'));if(board)break;await wait(50);}
  await board.waitForLoadState();await board.locator('#recommend').click();
  await board.locator('#advice[data-status=ready]').waitFor();
  assert.match(await overlay.locator('#advice-move').textContent(),/移動至第/);
  assert.equal(await board.locator('.cell.advised').count(),1);
  const before=(await overlay.evaluate(()=>window.overlayApp.getState())).value;
  const doc=(await overlay.evaluate(()=>window.overlayApp.getBoard())).value;
  doc.model.cells[4]={kind:'inmate',beast:'lion',tier:3};
  assert.equal((await overlay.evaluate(d=>window.overlayApp.editBoard({revision:d.revision,model:d.model,confirmed:[]}),doc)).ok,true);
  await board.locator('#advice[data-status=ready]').waitFor();
  let s;for(let i=0;i<100;i++){s=(await overlay.evaluate(()=>window.overlayApp.getState())).value;if(s.advice.status==='ready'&&s.advice.revision!==before.advice.revision)break;await wait(50);}
  assert.equal(s.advice.revision,s.analysis.revision);assert.notEqual(s.advice.revision,before.advice.revision);
  await overlay.locator('#settings').click();let settings;for(let i=0;i<100;i++){settings=app.windows().find(p=>p.url().includes('/settings/index.html'));if(settings)break;await wait(50);}await settings.waitForLoadState();
  const recompute=overlay.evaluate(()=>window.overlayApp.recommend());
  const interactionStart=performance.now();for(let i=0;i<10;i++)await settings.locator('#opacity').fill(String(70+i));
  await recompute;console.log(`PASS settings 10 interactions during Solver: ${(performance.now()-interactionStart).toFixed(0)}ms`);
  const failed=await overlay.evaluate(()=>window.overlayApp.analyzeCapture());assert.equal(failed.ok,false);
  s=(await overlay.evaluate(()=>window.overlayApp.getState())).value;assert.equal(s.advice.action,undefined);assert.match(s.advice.message,/失敗/);
  await board.locator('#recommend').click();await board.locator('#advice[data-status=ready]').waitFor();
  await board.screenshot({path:path.join(run,'board.png')});await overlay.screenshot({path:path.join(run,'overlay.png')});
  assert.deepEqual(errors,[]);console.log('PASS saved board → Solver → overlay, target highlighting, edits, supersession, UI responsiveness, failed scan invalidation and recovery');console.log(run);
}finally{await app?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

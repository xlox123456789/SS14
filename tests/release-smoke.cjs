'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const executablePath=path.resolve(process.argv[2]||'.release/SS14/dist/win-unpacked/SS14.exe');
const image=process.argv[3]?path.resolve(process.argv[3]):null;
const output=path.resolve('tests/.runs/release');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'profile-'));
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({schemaVersion:1,opacity:1,alwaysOnTop:true,showOnStartup:true,captureShortcut:'Control+Shift+F10',targetWindow:null,position:null,analysisMode:'manual',autoConsent:false,logPath:''}));
const env={...process.env,PATH:'C:\\Windows\\System32;C:\\Windows'};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_PATH;
let app;const errors=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function launch(){
  app=await _electron.launch({executablePath,args:[`--user-data=${profile}`],env,timeout:30000});
  app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
  let page;for(let i=0;i<100;i++){page=app.windows().find(p=>p.url().includes('/overlay/index.html'));if(page)break;await wait(50);}
  await page.waitForLoadState();return page;
}
(async()=>{try{
  let overlay=await launch();assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.5.3');
  assert.equal(await app.evaluate(({app})=>app.getName()),'SS14');assert.ok((await overlay.locator('body').innerText()).includes('SS14'));
  await overlay.locator('#settings').click();let settings;for(let i=0;i<100;i++){settings=app.windows().find(p=>p.url().includes('/settings/index.html'));if(settings)break;await wait(50);}await settings.waitForLoadState();
  assert.ok((await settings.locator('body').innerText()).includes('SS14'));
  assert.equal((await settings.evaluate(()=>window.overlayApp.saveSettings({opacity:.8,alwaysOnTop:false}))).ok,true);
  const fixture=require('./fixtures/upstream-board.json');
  const result=await app.evaluate(async({app},{fixture,image})=>{
    const load=process.getBuiltinModule('node:module').createRequire(app.getAppPath()+'/main.js');
    const {Strategy}=load(app.getAppPath()+'/src/strategy');const s=new Strategy();let recommendation;
    try{recommendation=await s.recommend({...fixture,checks:[],revision:'packaged'});}finally{await s.dispose();}
    let scan=null;if(image){const {Analyzer}=load(app.getAppPath()+'/src/analyzer');const a=new Analyzer();try{const r=await a.analyze({imagePath:image,kind:'board'});scan={ok:r.ok,timing:r.timing,error:r.error};}finally{await a.dispose();}}
    return {recommendation:{status:recommendation.status,message:recommendation.message},scan,appPath:app.getAppPath()};
  },{fixture,image});assert.equal(result.recommendation.status,'ready');if(image)assert.equal(result.scan.ok,true,JSON.stringify(result.scan));
  await app.close();app=null;overlay=await launch();const state=(await overlay.evaluate(()=>window.overlayApp.getState())).value;
  assert.equal(state.settings.opacity,.8);assert.equal(state.settings.alwaysOnTop,false);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({packagedExecutable:true,noNodeOrPythonOnPath:true,settingsPersist:true,rendererErrors:errors,...result},null,2));
  console.log(JSON.stringify({pass:true,packagedExecutable:true,noNodeOrPythonOnPath:true,settingsPersist:true,...result}));
}finally{await app?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

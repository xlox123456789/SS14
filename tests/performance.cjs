'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {_electron}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(process.argv[2] || '.'), label=process.argv[3] || 'current';
const output=path.resolve('tests/.runs');fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(output,'perf-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=path.resolve('overlay/node_modules/electron/dist/electron.exe');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let app,target;
const percentile=(a,p)=>a.length?a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]:0;
(async()=>{
  try {
    target=await _electron.launch({executablePath,args:[path.resolve('tests/fixtures/image-target.cjs'),`--image=${path.resolve('.research/perf-input.png')}`],env});
    await (await target.firstWindow()).waitForLoadState();
    fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({schemaVersion:1,opacity:1,alwaysOnTop:true,showOnStartup:true,captureShortcut:'Control+Shift+F12',targetWindow:null,position:null,analysisMode:'manual',autoConsent:false,logPath:''}));
    app=await _electron.launch({executablePath,args:[path.join(root,'overlay'),`--user-data=${profile}`],env,timeout:30000});
    let overlay;
    for(let i=0;i<100;i++){overlay=app.windows().find(p=>p.url().includes('/overlay/index.html'));if(overlay)break;await wait(50);}
    if(!overlay)throw new Error('Overlay not created');await overlay.waitForLoadState();
    await overlay.evaluate(()=>window.overlayApp.openSettings());
    let settings;
    for(let i=0;i<100;i++){settings=app.windows().find(p=>p.url().includes('/settings/index.html'));if(settings)break;await wait(50);}
    await settings.waitForLoadState();
    const windows=(await overlay.evaluate(()=>window.overlayApp.listWindows())).value;
    const selected=windows.find(w=>w.title==='效能量測視窗');if(!selected)throw new Error('No native capture target');
    await overlay.evaluate(targetWindow=>window.overlayApp.saveSettings({targetWindow}),selected);
    await app.evaluate(({BrowserWindow,app})=>{
      const {monitorEventLoopDelay}=process.getBuiltinModule('node:perf_hooks'),v8=process.getBuiltinModule('node:v8');
      globalThis.__bench={messages:0,bytes:0,cpu:process.cpuUsage(),start:performance.now(),samples:[],hist:monitorEventLoopDelay({resolution:10})};
      __bench.hist.enable();
      for(const w of BrowserWindow.getAllWindows()){
        const send=w.webContents.send.bind(w.webContents);w.webContents.send=(channel,...args)=>{if(channel==='app:state-changed'){__bench.messages++;__bench.bytes+=v8.serialize(args).byteLength;}return send(channel,...args);};
      }
    });
    for(const page of [overlay,settings]) await page.evaluate(()=>{
      window.__perf={lags:[],longTasks:[]};let previous=performance.now();
      window.__timer=setInterval(()=>{const now=performance.now();__perf.lags.push(Math.max(0,now-previous-25));previous=now;},25);
      new PerformanceObserver(list=>list.getEntries().forEach(e=>__perf.longTasks.push(e.duration))).observe({entryTypes:['longtask']});
    });
    const times=[],states=[],memory=[];
    for(let i=0;i<10;i++){
      const start=performance.now();
      const result=await overlay.evaluate(()=>window.overlayApp.analyzeCapture());
      times.push(performance.now()-start);states.push(result.ok);
      memory.push(await app.evaluate(({app})=>app.getAppMetrics().filter(m=>m.type==='Browser'||m.type==='Tab').reduce((s,m)=>s+m.memory.workingSetSize,0)/1024));
      console.log(`${label} scan ${i+1}: ${Math.round(times.at(-1))}ms, success=${result.ok}`);
    }
    const interactions=[];
    for(let i=0;i<20;i++){
      const start=performance.now();await settings.locator('#opacity').fill(String(60+i));
      await overlay.evaluate(()=>document.getElementById('fold').click());
      await app.evaluate(({BrowserWindow},i)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/overlay/index.html')).setPosition(1100+i,100+i),i);
      interactions.push(performance.now()-start);
    }
    const capture=(await overlay.evaluate(()=>window.overlayApp.getState())).value.capture.last;
    let start=performance.now();for(let i=0;i<30;i++)await overlay.evaluate(()=>window.overlayApp.getState());
    const stateReadMs=(performance.now()-start)/30;
    const ui=[];for(const page of [overlay,settings])ui.push(await page.evaluate(()=>({lagP95:__perf.lags.sort((a,b)=>a-b)[Math.floor(__perf.lags.length*.95)]||0,lagMax:Math.max(0,...__perf.lags),longTasks:__perf.longTasks.length,longTaskMax:Math.max(0,...__perf.longTasks)})));
    const main=await app.evaluate(()=>{const b=__bench,cpu=process.cpuUsage(b.cpu);b.hist.disable();return {messages:b.messages,ipcMB:b.bytes/1048576,mainLagP99:b.hist.percentile(99)/1e6,mainLagMax:b.hist.max/1e6,cpuMs:(cpu.user+cpu.system)/1000,elapsedMs:performance.now()-b.start};});
    const result={label,input:'Actual locally captured game PNG rendered in a native test window; performance measurement, not live gameplay validation.',image:{width:capture.width,height:capture.height},scans:times,successes:states.filter(Boolean).length,scanMedian:percentile(times,.5),scanP95:percentile(times,.95),interactionP95:percentile(interactions,.95),stateReadMs,ui,main,memoryMB:memory};
    fs.writeFileSync(path.join(output,`performance-${label}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } finally {
    await app?.close().catch(()=>{});await target?.close().catch(()=>{});
    if(path.resolve(profile).startsWith(output+path.sep))fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});

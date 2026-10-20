'use strict';
// Same private local screenshot for both versions; never writes image data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const image=path.resolve(process.argv[2]||'.research/perf-board.png');
const baseline=path.resolve(process.argv[3]||'.research/before052');
async function measure(root){
  const {Analyzer}=require(path.join(root,'overlay/src/analyzer'));const a=new Analyzer(),runs=[];
  try{for(let i=0;i<5;i++){const start=performance.now(),r=await a.analyze({imagePath:image,kind:'board'});assert.equal(r.ok,true,'benchmark needs a genuine recognizable board');runs.push({ms:performance.now()-start,raw:r.raw,timing:r.timing});}}
  finally{await a.dispose();}return runs;
}
(async()=>{
  const before=await measure(baseline),after=await measure(process.cwd());
  for(let i=0;i<before.length;i++){const a=structuredClone(after[i].raw),b=structuredClone(before[i].raw);delete a.ms;delete b.ms;assert.deepEqual(a,b,'all original scanner outputs must match');}
  const summary=runs=>{const warmMs=runs.slice(1).map(r=>r.ms),sorted=warmMs.slice().sort((a,b)=>a-b);return {coldMs:runs[0].ms,warmMs,warmMedianMs:(sorted[1]+sorted[2])/2};};
  const report={date:'2026-10-20',baseline:'9ec85c8',input:'Same user-provided genuine board screenshot; sequential runs; no labeled accuracy claim.',before:summary(before),after:summary(after),completeOutputParity:5,afterTiming:after.map(r=>r.timing)};
  fs.writeFileSync(path.resolve('docs/performance-0.5.2.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});

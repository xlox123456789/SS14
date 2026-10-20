'use strict';
// Run the unmodified browser Worker in a persistent Node worker. No UI work here.
const {parentPort}=require('node:worker_threads');
const path=require('node:path');
const root=path.resolve(__dirname,'../../vendor/coffeebns');
const M=require(path.join(root,'model-core.cjs'));
const bestMove=require(path.join(root,'recommend-core.cjs'));
const {createUpstreamWorker}=require('../shared/upstream-worker.cjs');
const context=createUpstreamWorker('solver-worker.js');
let job=null;
const stop=()=>{context.onmessage({data:{stop:true}});job=null;};
context.postMessage=message=>{
  if(job?.id!==message.id)return;
  const r=message.result,elapsed=performance.now()-job.started;
  // Same time cap/minimum rounds/tie policy as the upstream Analyzer.
  if(!r.done&&elapsed<700)return;
  if(!r.done){r.early=true;context.onmessage({data:{stop:true}});}
  const pick=bestMove({st:job.st,instant:job.instant,result:r});
  const result={status:pick?'ready':'blocked',message:pick?'':'目前沒有可用的建議走法。',action:pick?.action||null,
    cancelConsume:!!(job.mealPick&&job.model.step==='manage'&&pick?.action?.type==='end'),
    provisional:job.checks.length>0,pending:job.checks.length,rounds:r.rounds,elapsedMs:elapsed,
    method:pick?.live?'simulation':'policy',expected:pick?.option?.n>1?pick.option.mean:null,
    alternatives:r.options.slice(0,3).map(o=>({action:o.action,mean:o.n>1?o.mean:null})),raw:{pick,result:r}};
  const id=job.id;job=null;parentPort.postMessage({id,result});
};
parentPort.on('message',m=>{
  stop();if(m.stop)return;
  try{
    const model=M.normalize(m.model),checks=m.checks||[];
    const critical=checks.filter(k=>k==='warden'||(k==='dest'&&model.step==='patrol')||(k==='choice'&&model.step==='choice'));
    if(model.treasureWait||critical.length||(model.step==='event'&&!context.Tartarus.EVENTS[model.eventKind])){
      parentPort.postMessage({id:m.id,result:{status:'blocked',message:model.treasureWait?'等待完整盤面後再計算建議。':'請先確認典獄長、移動位置或目前選項，再計算建議。',critical}});return;
    }
    const {st,problems}=M.buildState(model);
    if(problems.length){parentPort.postMessage({id:m.id,result:{status:'blocked',message:'盤面資料不一致，請確認目前階段、典獄長位置、可移動位置與囚犯資料。',problems}});return;}
    job={id:m.id,st,model,checks,mealPick:m.mealPick,instant:context.TartarusSolver.instant(st),started:performance.now()};
    context.onmessage({data:{id:m.id,state:st,rollouts:400}});
  }catch(error){job=null;context.onmessage({data:{stop:true}});parentPort.postMessage({id:m.id,result:{status:'error',message:'策略計算失敗，請修正盤面後重試。',error:error.stack}});}
});

'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const {describe}=require('./labels');
class Strategy {
  constructor(){this.worker=null;this.pending=null;this.sequence=0;this.starts=0;}
  ensureWorker(){
    if(this.worker)return;
    const worker=this.worker=new Worker(path.join(__dirname,'worker.cjs'));this.starts++;
    worker.on('message',m=>{if(this.pending?.id===m.id)this.finish(null,m.result);});
    worker.on('error',e=>{if(this.worker===worker){this.worker=null;this.finish(new Error(`策略程序錯誤：${e.message}`));}});
    worker.on('exit',code=>{if(this.worker===worker){this.worker=null;this.finish(new Error(`策略程序已停止（${code}）。`));}});
  }
  finish(error,result){const p=this.pending;if(!p)return;this.pending=null;clearTimeout(p.timer);this.worker?.unref();error?p.reject(error):p.resolve(result);}
  cancel(){this.worker?.postMessage({stop:true});this.finish(null,{status:'cancelled'});}
  recommend(doc){
    this.cancel();
    if(!doc?.model)return Promise.resolve({status:'blocked',message:'尚無盤面可計算建議。'});
    return new Promise((resolve,reject)=>{
      this.ensureWorker();const id=++this.sequence;
      const timer=setTimeout(()=>{const w=this.worker;this.worker=null;w?.terminate();this.finish(new Error('策略計算逾時，請確認盤面後重新計算。'));},15000);
      this.pending={id,resolve,reject,timer};this.worker.ref();
      this.worker.postMessage({id,model:doc.model,checks:doc.checks||[],mealPick:!!doc.raw?.chain});
    }).then(result=>({...result,revision:doc.revision,alternatives:result.alternatives?.map(o=>({...o,label:describe(o.action,doc.model)})),...(result.action?{message:describe(result.action,doc.model,result.cancelConsume)}:{})}));
  }
  dispose(){this.cancel();const w=this.worker;this.worker=null;return w?.terminate();}
}
module.exports={Strategy};

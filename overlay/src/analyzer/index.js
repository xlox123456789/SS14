'use strict';
const path = require('node:path');
const { Worker } = require('node:worker_threads');
class Analyzer {
  constructor() { this.worker=null;this.pending=null;this.sequence=0;this.starts=0; }
  ensureWorker() {
    if(this.worker)return;
    const worker=this.worker=new Worker(path.join(__dirname,'worker.cjs'));this.starts++;
    worker.on('message',message=>{
      if(message.ready)return;
      if(this.pending?.id!==message.id)return;
      this.finish(null,message.result);
    });
    worker.on('error',error=>{if(this.worker===worker){this.worker=null;this.finish(new Error(`辨識程序錯誤：${error.message}`));}});
    worker.on('exit',code=>{if(this.worker===worker){this.worker=null;this.finish(new Error(`辨識程序已中止（${code}）。`));}});
  }
  finish(error,result) {
    const pending=this.pending;if(!pending)return;this.pending=null;clearTimeout(pending.timer);
    this.worker?.unref();
    error?pending.reject(error):pending.resolve(result);
  }
  analyze(capture, base) {
    if (this.pending) return Promise.reject(new Error('正在辨識，請稍候。'));
    if (!capture?.imagePath) return Promise.reject(new Error('缺少截圖，請先截圖。'));
    return new Promise((resolve, reject) => {
      this.ensureWorker();
      const id=++this.sequence;
      const timer=setTimeout(()=>{
        const worker=this.worker;this.worker=null;worker?.terminate();
        this.finish(new Error('辨識逾時，請確認盤面完整顯示後重試。'));
      },45000);
      this.pending={id,resolve,reject,timer};
      this.worker.ref();
      try {this.worker.postMessage({id,imagePath:capture.imagePath,kind:capture.kind,fresh:capture.fresh,checks:capture.checks,base});}
      catch(error){this.finish(error);}
    });
  }
  dispose() {const worker=this.worker;this.worker=null;this.finish(new Error('辨識已停止。'));return worker?.terminate();}
}
module.exports = { Analyzer };

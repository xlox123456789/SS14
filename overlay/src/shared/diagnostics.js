'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {monitorEventLoopDelay}=require('node:perf_hooks');
class Diagnostics {
  constructor(folder) {
    this.file=path.join(folder,'diagnostics.log');this.queue=[];this.writing=Promise.resolve();this.recent=[];
    this.value={jobState:'Idle',lastLogRead:null,lastEvent:null,lastCapture:null,lastAnalysis:null,lastAnalysisMs:null,lastError:null,metrics:{}};
    this.hist=monitorEventLoopDelay({resolution:20});this.hist.enable();this.lastCpu=process.cpuUsage();this.lastSample=performance.now();
    this.timer=setInterval(()=>this.sample(),5000);this.timer.unref();
  }
  record(stage,details={}) {
    const entry={at:new Date().toISOString(),stage,...details};this.recent.push(entry);if(this.recent.length>40)this.recent.shift();
    this.queue.push(JSON.stringify(entry));if(this.queue.length>500)this.queue.shift();
    if(!this.flushTimer)this.flushTimer=setTimeout(()=>{this.flushTimer=null;this.flush();},250);
    return entry;
  }
  sample() {
    const elapsed=performance.now()-this.lastSample,cpu=process.cpuUsage(this.lastCpu);
    this.value.metrics={...this.value.metrics,mainLagP99Ms:Math.round(this.hist.percentile(99)/1e4)/100,mainLagMaxMs:Math.round(this.hist.max/1e4)/100,rssMB:Math.round(process.memoryUsage().rss/1048576),processCpuOneCorePercent:Math.round((cpu.user+cpu.system)/elapsed/10)};
    this.hist.reset();this.lastCpu=process.cpuUsage();this.lastSample=performance.now();
  }
  snapshot() { return {...this.value,metrics:{...this.value.metrics},file:this.file,recent:this.recent.slice(-12)}; }
  flush() {
    const lines=this.queue.splice(0);if(!lines.length)return this.writing;
    this.writing=this.writing.then(async()=>{
      await fs.mkdir(path.dirname(this.file),{recursive:true});
      const stat=await fs.stat(this.file).catch(()=>null);
      if(stat?.size>2*1024*1024){await fs.rm(`${this.file}.1`,{force:true});await fs.rename(this.file,`${this.file}.1`);}
      await fs.appendFile(this.file,lines.join('\n')+'\n');
    }).catch(()=>{this.value.logWriteError='診斷檔無法寫入，請檢查資料夾權限。';});
    return this.writing;
  }
  dispose() {clearInterval(this.timer);clearTimeout(this.flushTimer);this.hist.disable();return this.flush();}
}
module.exports={Diagnostics};

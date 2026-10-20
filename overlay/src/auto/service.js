'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const createCore = require('../../vendor/coffeebns/auto-core.cjs');
const finder = require('../../vendor/coffeebns/find-log.cjs');
const {PAGE_RULES}=require('./log-rules');
const kinds = { board:'盤面變更', instruments:'刑具選擇', objective:'目標選擇', treasure:'典獄長寶藏', skip:'新一天切換', speed:'遊戲加速切換' };
class AutoService extends EventEmitter {
  constructor({ analyze, busy, remember,diagnostics }) {
    super(); this.analyze = analyze; this.busy = busy; this.remember = remember;
    this.epoch = 0; this.timer = null; this.retry = null; this.follow = null; this.core = null; this.log = ''; this.settings = null;
    this.diagnostics=diagnostics||{value:{},record:()=>{}};this.running=false;this.pendingJob=null;this.jobSequence=0;
    this.state = { status:'waiting', message:'等待遊戲', progress:'未知', logPath:'', lines:0, events:0, captures:0, detail:'unknown', diagnostics:[] };
  }
  snapshot() {const {diagnostics,...summary}=this.state;return {...summary,pending:!!this.pendingJob,diagnostics:[]};}
  update(patch) { Object.assign(this.state, patch); this.emit('state'); }
  note(message) {this.diagnostics.record('monitor.note',{message});}
  phase(jobState,message) {this.state.jobState=jobState;this.update({message});if(!this.busy())this.diagnostics.value.jobState=jobState;}
  workState(jobState) {if(this.active)this.update({jobState});}
  configure(settings) {
    const key = JSON.stringify([settings.analysisMode,settings.autoConsent,settings.logPath,settings.targetWindow]);
    if (key === this.key) return;
    this.key = key; this.stop(); this.settings = settings;
    if (settings.analysisMode !== 'auto') { this.update({ status:'manual', message:'手動分析 · 按 F9', progress:'未知' }); return; }
    if (!settings.autoConsent) { this.update({ status:'waiting', message:'等待授權 · 請開啟設定', progress:'未知' }); return; }
    if (!settings.targetWindow) { this.update({ status:'waiting', message:'等待遊戲 · 請選擇遊戲視窗' }); return; }
    this.active = true; const epoch = this.epoch;
    this.core = createCore({
      setState: () => {},
      emit: (type, hit) => {
        if (!this.active || epoch !== this.epoch) return;
        if (type === 'hit') {
          if (hit.kind === 'skip') { clearTimeout(this.retry);this.pendingJob=null;this.pending=false; }
          if (hit.kind === 'speed') { this.fast = !this.fast; this.core.setPace(this.fast ? .4 : 1); }
          const progress = kinds[hit.kind] || '未知';
          this.diagnostics.value.lastEvent={at:new Date().toISOString(),kind:hit.kind,stamp:hit.at};
          this.diagnostics.record('log.event',{kind:hit.kind,stamp:hit.at});
          this.update({ status:'event', message:'偵測到事件', progress, events:this.state.events + 1 }); this.note(progress);
          if(!this.running&&!this.busy())this.phase('EventDetected','偵測到事件');
        }
      },
      grab: async (kind,hits) => {
        // Same fresh-offer test as follow.js, and reroll carry-over as auto.js.
        const fromStart = (hits || []).some(h => /check cur=0\b/.test(h.text || ''));
        this.pickFresh = kind === 'instruments' && (fromStart || (this.lastKind === 'instruments' && this.pickFresh));
        this.lastKind = kind;
        if (this.pickFresh) this.update({progress:'SS14開始 · 刑具選擇'});
        await this.dispatch(epoch,0,kind,this.pickFresh); return null;
      },
    });
    this.core.setRules([...this.core.rules().map(r=>({kind:r.kind,pattern:r.re.source,settle:r.settle,rank:r.rank})),...PAGE_RULES]);
    this.update({ status:'waiting', message:'等待遊戲 · 尋找 Log', progress:'未知' });
    this.lookAt = 0; this.ticking = false; this.seen = new Set(); this.fast = false; this.lastKind=''; this.pickFresh=false;
    this.timer = setInterval(() => this.tick(epoch), 1000); this.tick(epoch);
  }
  async useLog(filename, epoch) {
    this.follow?.stop(); this.core.stop(); this.log = filename;
    let previousIdentity=null,previousPrefix=null,previousBoundary=null;
    this.follow = this.core.follower(message => this.onMessage(message, epoch));
    this.follow.rules(this.core.rules().map(r => r.re.source), this.core.watch()?.source);
    const handle = { name:path.basename(filename), getFile:async () => {
      let file;
      try {
        file = await fs.open(filename, 'r'); const stat = await file.stat();
        if(epoch===this.epoch)this.diagnostics.value.lastLogRead=new Date().toISOString();
        const head = Buffer.alloc(Math.min(256, stat.size)); await file.read(head,0,head.length,0);
        const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
        let boundaryChanged = false;
        if (previousBoundary && stat.size >= previousBoundary.end) {
          const old = Buffer.alloc(previousBoundary.data.length); await file.read(old,0,old.length,previousBoundary.end-old.length);
          boundaryChanged = !old.equals(previousBoundary.data);
        }
        const tail = Buffer.alloc(Math.min(64,stat.size)); await file.read(tail,0,tail.length,stat.size-tail.length);
        previousBoundary = {end:stat.size,data:tail};
        const replaced = previousIdentity && (boundaryChanged || previousIdentity !== identity || (previousPrefix && !head.subarray(0, Math.min(head.length,previousPrefix.length)).equals(previousPrefix.subarray(0, Math.min(head.length,previousPrefix.length)))));
        previousIdentity = identity; previousPrefix = head;
        // Tell the unchanged follower about equal-size replacements too.
        return { name:path.basename(filename), size:replaced ? 0 : stat.size, slice:(start,end) => ({ arrayBuffer:async () => {
          const reader = await fs.open(filename,'r');
          try { const buffer = Buffer.alloc(Math.min(1024*1024, Math.max(0,end-start))); const {bytesRead} = await reader.read(buffer,0,buffer.length,start); return buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+bytesRead); }
          finally { await reader.close(); }
        } }) };
      } catch (error) { if (error.code === 'ENOENT') { const missing = new Error('Log 尚未建立'); missing.name = 'NotFoundError'; throw missing; } throw error; }
      finally { await file?.close(); }
    } };
    this.update({ logPath:filename }); this.remember(filename); this.note('已連接 Log；從檔案尾端開始，忽略舊事件。');
    await this.follow.start(handle, false);
  }
  onMessage(message, epoch) {
    if (!this.active || epoch !== this.epoch) return;
    if (message.type === 'started' || message.type === 'rotated') {
      if(message.type==='rotated')this.seen.clear();
      this.update({ status:'monitoring', message:'正在監控', progress:message.type === 'rotated' ? '遊戲 Log 已重建，進度未知' : this.state.progress });
      if (message.type === 'rotated') this.note('Log 清空或重建，已恢復讀取。');
      if(!this.running)this.phase('Monitoring','正在監控');
    } else if (message.type === 'gone') this.update({ status:'waiting', message:'等待遊戲 · Log 尚未建立', progress:'未知' });
    else if (message.type === 'error') { this.update({ status:'error', message:'監控異常 · 可按 F9', progress:'未知' });this.diagnostics.value.lastError={at:new Date().toISOString(),message:message.message};this.diagnostics.record('log.error',{error:message.message}); this.note('Log 讀取失敗，將自動重試。'); }
    else if (message.type === 'lines') {
      this.state.lines += message.count;
      this.detailCounts ||= [0,0]; this.detailCounts[0] += message.count; this.detailCounts[1] += message.detail || 0;
      if (this.detailCounts[0] >= 2000 && this.detailCounts[1] < .02*this.detailCounts[0]) this.state.detail='off';
      else if (this.detailCounts[1] >= 50) this.state.detail='on';
      if (this.detailCounts[0] > 5000) this.detailCounts = [message.count,message.detail||0];
      if (this.state.status === 'error' || this.state.status === 'waiting') this.update({ status:'monitoring',message:'正在監控' });
      for (const hit of message.hits) {
        const stamped = /^\[[^\]]+\]/.test(hit.line);
        if (stamped && this.seen.has(hit.line)) continue;
        if (stamped) { this.seen.add(hit.line); if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value); }
        // Upstream documents max=0 as the results screen. No invented battle trigger.
        if (hit.rule < 0 && /\[S16LastDay\] check cur=\d+ max=0\b/.test(hit.line)) {
          this.core.stop();clearTimeout(this.retry);this.pendingJob=null; this.pending = false; this.update({ progress:'SS14結算畫面',status:'monitoring',message:'正在監控' }); this.note('偵測到原版註明的結算行（max=0），取消等待中的截圖。');
        } else this.core.onLine(hit);
      }
      this.emit('state');
    }
  }
  async tick(epoch) {
    if (!this.active || epoch !== this.epoch || this.ticking) return;
    this.ticking = true;
    try {
      if (Date.now() - this.lookAt > 10000) {
        this.lookAt = Date.now();
        let found = this.log || await finder.find(this.settings.logPath);
        if (found) { const newest = finder.newestLog([path.dirname(found)]); if (newest) found = newest.p; }
        if (!this.active || epoch !== this.epoch) return;
        if (found && found !== this.log) await this.useLog(found,epoch);
      }
      await this.follow?.tick();
    } catch { if (epoch === this.epoch) { this.update({ status:'error',message:'監控異常 · 可按 F9' }); this.note('尋找或讀取 Log 失敗，將自動重試。'); } }
    finally { if (epoch === this.epoch) this.ticking = false; }
  }
  async dispatch(epoch, attempt = 0, kind = 'board', fresh = false) {
    if (!this.active || epoch !== this.epoch) return;
    this.pendingJob={epoch,attempt,kind,fresh,sequence:++this.jobSequence};this.pending=true;
    this.diagnostics.record('analysis.queued',{sequence:this.jobSequence,kind,busy:this.busy()||this.running});
    return this.drain();
  }
  wake() {if(this.pendingJob&&!this.running){clearTimeout(this.retry);this.retry=setTimeout(()=>this.drain(),0);}}
  async drain() {
    if(!this.active||this.running||!this.pendingJob)return;
    if(this.busy()){clearTimeout(this.retry);this.retry=setTimeout(()=>this.drain(),500);return;}
    const job=this.pendingJob;this.pendingJob=null;this.pending=false;this.running=true;clearTimeout(this.retry);this.retry=null;
    let result;
    try {
      this.update({status:'capturing',message:'正在截圖',jobState:'Capturing'});
      result=await this.analyze(job.kind,job.fresh);
      if(!this.active||job.epoch!==this.epoch)return;
      this.update({captures:this.state.captures+(result.waiting?0:1),jobState:result.ok?'Completed':'Error'});
      this.note(result.waiting?'偵測到寶藏視窗，等待完整盤面。':result.ok?'自動截圖及辨識完成。':`自動分析未完成：${result.error}`);
    } catch(error) {
      result={ok:false,error:error.message};this.diagnostics.record('auto.analysis.error',{error:error.message});
    } finally {
      this.running=false;
      if(this.active&&job.epoch===this.epoch){
        // A failure must not stop the follower or erase a newer pending stage.
        this.update({status:'monitoring',message:result?.ok?'正在監控':'正在監控 · 上次分析失敗，可按 F9',jobState:'Monitoring'});
        this.diagnostics.value.jobState='Monitoring';
        if(this.pendingJob)this.wake();
        else if(result&&!result.ok&&result.stage==='capture'&&job.attempt<1){
          this.pendingJob={...job,attempt:job.attempt+1};this.pending=true;
          this.retry=setTimeout(()=>this.drain(),1500);
        }
      }
      else if(this.active&&this.pendingJob)this.wake();
    }
  }
  stop() {
    this.active = false; this.epoch++; clearInterval(this.timer); clearTimeout(this.retry);
    this.follow?.stop(); this.core?.stop(); this.follow=null; this.core=null; this.timer=null; this.retry=null; this.pending=false;this.pendingJob=null;this.log='';this.state.jobState='Idle';
    if(!this.busy())this.diagnostics.value.jobState='Idle';
  }
  dispose() { this.stop(); }
}
module.exports = { AutoService };

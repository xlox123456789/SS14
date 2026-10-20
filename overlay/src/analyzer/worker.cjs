'use strict';
const { parentPort } = require('node:worker_threads');
const path = require('node:path');
const root = path.resolve(__dirname, '../../vendor/coffeebns');
const P = require(path.join(root, 'tools/png'));
const M = require(path.join(root, 'model-core.cjs'));
let workerData,input;
const {createUpstreamWorker}=require('../shared/upstream-worker.cjs');
const context=createUpstreamWorker('scan-worker.js');
function reply(result) { parentPort.postMessage({id:workerData.id,result}); }
function run(job) {
workerData=job;
try {
  const decodeStarted=performance.now();
  const img = P.read(workerData.imagePath);
  const decodeMs=performance.now()-decodeStarted;
  if (img.width * img.height > 40000000) throw new Error('圖片尺寸過大。');
  context.postMessage = message => {
    if (message.error) throw new Error(message.error);
    const raw = message.result;
    if (!raw.ok) {
      if (message.kind === 'pick') { context.onmessage({data:{...input,kind:undefined}}); return; }
      reply({ ok: false, raw }); return;
    }
    if (message.kind === 'pick') {
      const sure = raw.cards.map(c=>c.conf).sort((a,b)=>b-a)[1] || 0;
      if (workerData.kind === 'manual' && sure < .5) { context.onmessage({data:{...input,kind:undefined}}); return; }
      reply(require('./pick-model').pickModel(raw,workerData.base,workerData.fresh,workerData.checks)); return;
    }
    const read = M.scanToModel(raw, M.normalize(workerData.base));
    const checks = [...read.checks].map(n => `cell:${n}`);
    if (!raw.warden || raw.warden.conf < .6) checks.push('warden');
    if (!raw.doors || raw.doors.conf < .6) checks.push('dest');
    if (!raw.days) checks.push('day');
    if (!raw.chromatic || raw.chromatic.conf < .6) checks.push('vault');
    if (!raw.tools?.found || read.model.toolsToConfirm || raw.tools?.tools?.some(t => t.conf < .9)) checks.push('tools');
    checks.push('objective');
    reply({ ok: true, raw, model: read.model, checks: [...new Set(checks)], notes: read.notes,timing:{decodeMs,scanMs:raw.ms} });
  };
  input = { id:workerData.id, kind:['instruments','manual'].includes(workerData.kind) ? 'pick' : undefined, width:img.width, height:img.height, buffer:img.data.buffer.slice(img.data.byteOffset,img.data.byteOffset+img.data.byteLength),lang:'zh' };
  context.onmessage({data:input});
} catch (error) { reply({ ok: false, error: error.message }); }
finally {workerData=null;input=null;context.postMessage=null;}
}
parentPort.on('message',run);
parentPort.postMessage({ready:true});

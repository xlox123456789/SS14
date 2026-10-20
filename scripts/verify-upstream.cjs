'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../overlay/vendor/coffeebns');
const manifest=require(path.join(root,'manifest.json'));
for(const [file,item] of Object.entries(manifest.files)) {
  const text=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  assert.equal(crypto.createHash('sha256').update(text).digest('hex'),item.sha256,file);
}
for(const file of ['model-core.cjs','auto-core.cjs','find-log.cjs','recommend-core.cjs']) {
  const before=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  require('node:child_process').execFileSync(process.execPath,[path.resolve(__dirname,file==='recommend-core.cjs'?'extract-upstream-strategy.cjs':file==='model-core.cjs'?'extract-upstream-model.cjs':'extract-upstream-auto.cjs')]);
  assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),before,`${file} extraction reproducible`);
}
console.log(`PASS ${Object.keys(manifest.files).length} upstream source hashes and reproducible extraction (${manifest.commit})`);

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {migrateProfile}=require('../overlay/src/settings/migrate');
test('profile migration preserves old files and never overwrites current preferences',t=>{
  const root=path.resolve(__dirname,'.runs');fs.mkdirSync(root,{recursive:true});const folder=fs.mkdtempSync(path.join(root,'migration-'));
  t.after(()=>{if(folder.startsWith(root+path.sep))fs.rmSync(folder,{recursive:true,force:true});});
  const old=path.join(folder,'Tartarus Overlay 繁中版'),dest=path.join(folder,'SS14');fs.mkdirSync(old);
  fs.writeFileSync(path.join(old,'settings.json'),'old settings');fs.writeFileSync(path.join(old,'board.json'),'old board');
  migrateProfile(folder,dest);assert.equal(fs.readFileSync(path.join(dest,'settings.json'),'utf8'),'old settings');
  fs.writeFileSync(path.join(dest,'settings.json'),'current settings');migrateProfile(folder,dest);
  assert.equal(fs.readFileSync(path.join(dest,'settings.json'),'utf8'),'current settings');
  assert.equal(fs.readFileSync(path.join(old,'settings.json'),'utf8'),'old settings');assert.equal(fs.readFileSync(path.join(dest,'board.json'),'utf8'),'old board');
});

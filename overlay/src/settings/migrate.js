'use strict';
const fs=require('node:fs'),path=require('node:path');
function migrateProfile(appData,destination){
  const legacy=path.join(appData,'Tartarus Overlay 繁中版');
  if(path.resolve(legacy)===path.resolve(destination))return;
  for(const name of ['settings.json','board.json']){
    const source=path.join(legacy,name),target=path.join(destination,name);
    try{
      if(fs.existsSync(target)||!fs.existsSync(source)||fs.statSync(source).size>8*1024*1024)continue;
      fs.mkdirSync(destination,{recursive:true});fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
    }catch{/* A missing/locked old profile must not prevent startup. */}
  }
}
module.exports={migrateProfile};

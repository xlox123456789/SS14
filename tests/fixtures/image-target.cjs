'use strict';
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let html;
app.whenReady().then(()=>{
  const file=process.argv.find(a=>a.startsWith('--image='))?.slice(8);
  if (!file) throw new Error('Missing benchmark image');
  const size=nativeImage.createFromPath(file).getSize();
  const win=new BrowserWindow({width:size.width,height:size.height,useContentSize:true,x:0,y:0,title:'效能量測視窗',autoHideMenuBar:true,webPreferences:{sandbox:true}});
  win.removeMenu();
  // Real screenshots can exceed Chromium's data-URL navigation size limit.
  const folder=path.resolve('tests/.runs');fs.mkdirSync(folder,{recursive:true});html=path.join(folder,`image-target-${process.pid}.html`);
  fs.writeFileSync(html,'<title>效能量測視窗</title><body style="margin:0;background:#111"><img style="display:block" src="'+pathToFileURL(file).href+'">');
  win.loadFile(html);
});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{if(html)fs.rmSync(html,{force:true});});

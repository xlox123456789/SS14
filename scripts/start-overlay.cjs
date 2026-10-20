'use strict';
const path=require('node:path');const {spawn}=require('node:child_process');
const executable=path.join(__dirname,'../overlay/node_modules/electron/dist/electron.exe');
if(!require('node:fs').existsSync(executable)){console.error('缺少 Electron 執行檔，請依 README 安裝依賴。');process.exit(1);}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(executable,[path.join(__dirname,'../overlay'),...process.argv.slice(2)],{env,stdio:'inherit',windowsHide:true});
child.on('error',err=>{console.error(err.message);process.exit(1);});child.on('exit',code=>process.exit(code||0));

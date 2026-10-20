'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../vendor/coffeebns/js');
const exportsByFile={'scan.js':'TartarusScan','scan-data.js':'TARTARUS_SCAN','pick-data.js':'TARTARUS_PICK','engine.js':'Tartarus','tool-combos.js':'TARTARUS_COMBOS','solver.js':'TartarusSolver'};
// The upstream modules explicitly support CommonJS. Run their unmodified
// browser Worker wrapper with native Node modules inside our background Worker.
// A vm context makes hot pixel loops cross slower global/typed-array boundaries.
function createUpstreamWorker(file){
  if(!['scan-worker.js','solver-worker.js'].includes(file))throw new Error('Unsupported upstream Worker');
  const self={location:{search:''}};
  const importScripts=(...files)=>{for(const name of files){if(!Object.hasOwn(exportsByFile,name))throw new Error('Unexpected upstream import');self[exportsByFile[name]]=require(path.join(root,name));}};
  new Function('self','importScripts',fs.readFileSync(path.join(root,file),'utf8'))(self,importScripts);
  return self;
}
module.exports={createUpstreamWorker};

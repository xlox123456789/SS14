'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../overlay/vendor/coffeebns');
const source=fs.readFileSync(path.join(root,'js/analyze.js'),'utf8');
const start=source.indexOf('  function bestMove()'),end=source.indexOf('\n  }',start);
if(start<0||end<0)throw new Error('Upstream bestMove missing');
fs.writeFileSync(path.join(root,'recommend-core.cjs'),`// CoffeeBns analyze.js bestMove, extracted verbatim by scripts/extract-upstream-strategy.cjs.\n'use strict';\nconst S=require('./js/solver');\nconst LIVE_MIN=150,SWITCH_MIN=0.05;\nmodule.exports=function(solver){\n${source.slice(start,end+4)}\nreturn bestMove();\n};\n`);

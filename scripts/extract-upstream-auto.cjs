'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../overlay/vendor/coffeebns');
const capture = fs.readFileSync(path.join(root, 'js/capture.js'), 'utf8');
const follow = fs.readFileSync(path.join(root, 'js/follow.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
function fn(source, name, indent = '  ') {
  const pattern = new RegExp(`^${indent}(?:async )?function ${name}\\(`, 'm');
  const start = source.search(pattern); const end = source.indexOf(`\n${indent}}`, start);
  if (start < 0 || end < 0) throw new Error(`Missing function ${name}`);
  return source.slice(start, end + indent.length + 2);
}
const defaults = follow.slice(follow.indexOf('  const RANK ='), follow.indexOf('  // #endregion', follow.indexOf('  const RANK =')));
const header = `// Generated verbatim CoffeeBns follower/triggers + desktop bridge hooks.\n'use strict';\nmodule.exports = function createAutoCore({emit, setState, grab}) {\nlet rules = [], watch = null, burst = null, pace = 1;\nconst state = {hits:0,frames:0};\nconst sendRules = () => {};\nconst isBlank = () => false;\nconst whyNot = () => '截圖或辨識未完成';\nconst stampOf = line => { const m = /^\\[([^\\]]+)\\]/.exec(line); return m ? m[1] : ''; };\n`;
fs.writeFileSync(path.join(root, 'auto-core.cjs'), header + defaults + '\n' + fn(follow, 'parseRules') + '\n' + ['follower','onLine','fire','setRules','setPace','setWatch'].map(n => fn(capture,n)).join('\n').replace('const frame = await grab();', 'const frame = await grab(b.kind,b.hits); // Desktop bridge: preserve event kind and fresh-run evidence.') + `\nsetRules(parseRules(DEFAULT_RULES)); setWatch(DEFAULT_WATCH);\nreturn { follower, onLine, setPace, setRules, rules: () => rules, watch: () => watch, stop: () => { if(burst) clearTimeout(burst.timer); burst=null; } };\n};\n`);
const statStart = desktop.indexOf('const statOf =');
const statEnd = desktop.indexOf('\n};', statStart) + 3;
const virtualLine = desktop.split('\n').find(l => l.startsWith('const virtualStore ='));
const logHeader = `// Generated from CoffeeBns desktop/main.js; native-process lookup omitted.\n'use strict';\nconst fs=require('node:fs'),path=require('node:path');\nconst {execFile}=require('node:child_process');\nconst STEAM_APP='1974050',LOG_OVERRIDE=null,STALE_MS=120000;\nlet settings={},game={running:false},gameSince=0,logFoundBy='';\nconst besideGame=()=>[];\n`;
fs.writeFileSync(path.join(root, 'find-log.cjs'), logHeader + fn(desktop,'regQuery','') + '\n' + desktop.slice(statStart,statEnd) + '\n' + virtualLine + '\n' + fn(desktop,'newestLog','') + '\n' + fn(desktop,'findLog','') + '\nmodule.exports={find:async chosen=>{settings={logPath:chosen};return findLog();},newestLog};\n');

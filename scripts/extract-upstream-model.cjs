'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../overlay/vendor/coffeebns');
const source = fs.readFileSync(path.join(root, 'js/analyze.js'), 'utf8');
const names = ['cellSig', 'blankModel', 'normalize', 'buildState', 'keptTusk', 'chainToModel', 'runTools', 'scanToModel'];
const bodies = names.map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  }', start);
  if (start < 0 || end < 0) throw new Error(`Missing upstream function: ${name}`);
  return source.slice(start, end + 4);
});
const header = `// Generated from CoffeeBns analyze.js by scripts/extract-upstream-model.cjs.\n'use strict';\nconst T = require('./js/engine');\nconst L = n => T.cellLabel(n);\nconst clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));\nconst toInt = (v, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : fallback; };\nconst TOP_TIER = T.SUPREME, TOOL_SURE = 0.9;\nconst STEPS = ['patrol','manage','office','chain','event','ratway','choice'];\nconst officeCell = () => ({kind:'office'});\nconst sealedCell = () => ({kind:'sealed',event:null});\n// This scanner has no strategy; never infer an advised instrument pick.\nconst model = null;\nconst fresh = () => false;\nconst recommendation = () => null;\n`;
fs.writeFileSync(path.join(root, 'model-core.cjs'), header + bodies.join('\n\n') + '\nmodule.exports = { blankModel, normalize, buildState, scanToModel };\n');

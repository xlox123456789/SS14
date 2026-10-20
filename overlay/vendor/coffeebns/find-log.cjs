// Generated from CoffeeBns desktop/main.js; native-process lookup omitted.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process');
const STEAM_APP='1974050',LOG_OVERRIDE=null,STALE_MS=120000;
let settings={},game={running:false},gameSince=0,logFoundBy='';
const besideGame=()=>[];
function regQuery(key, value) {
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/v', value], { windowsHide: true }, (err, out) => {
      const m = !err && new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`).exec(out);
      resolve(m ? m[1].trim() : null);
    });
  });
}
const statOf = (p) => {
  try {
    return fs.statSync(p);
  } catch (e) {
    return null;
  }
};
const virtualStore = (p) => (/^[a-z]:\\program files/i.test(p) && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'VirtualStore', p.slice(3)) : null);
function newestLog(dirs) {
  let best = null;
  for (const dir of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => /^UE_game(_\d+)?\.log$/i.test(n));
    } catch (e) {
      continue;
    }
    for (const n of names) {
      const p = path.join(dir, n);
      const st = statOf(p);
      if (st && st.isFile() && (!best || st.mtimeMs > best.st.mtimeMs)) best = { p, st };
    }
  }
  return best;
}
async function findLog() {
  if (LOG_OVERRIDE) {
    logFoundBy = 'given';
    return path.resolve(LOG_OVERRIDE);
  }
  if (settings.logPath && statOf(path.dirname(settings.logPath))) {
    // A hand-picked log, unless the game stopped writing it and writes
    // another, beside it or beside the running game.
    const chosen = statOf(settings.logPath);
    const idle = game.running && Date.now() - gameSince > STALE_MS && (!chosen || Date.now() - chosen.mtimeMs > STALE_MS);
    const other = idle ? newestLog([path.dirname(settings.logPath), ...besideGame()]) : null;
    if (other && path.resolve(other.p) !== path.resolve(settings.logPath) && Date.now() - other.st.mtimeMs < STALE_MS) {
      logFoundBy = 'being written (the chosen one isn’t)';
      return other.p;
    }
    logFoundBy = 'chosen by the player';
    return settings.logPath;
  }
  const own = newestLog(besideGame());
  if (own) {
    logFoundBy = 'beside the running game';
    return own.p;
  }
  logFoundBy = 'in the game folders';
  const roots = new Map();
  const addRoot = (p) => p && roots.set(path.resolve(p).toLowerCase(), path.resolve(p));
  for (const [key, value] of [['HKCU\\Software\\Valve\\Steam', 'SteamPath'], ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'], ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath']]) addRoot(await regQuery(key, value));
  addRoot('C:\\Program Files (x86)\\Steam');
  const libraries = new Map(roots);
  for (const root of roots.values()) {
    try {
      const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
        const lib = path.resolve(m[1].replace(/\\\\/g, '\\'));
        libraries.set(lib.toLowerCase(), lib);
      }
    } catch (e) {
      // Not a Steam folder.
    }
  }
  const logs = [];
  for (const lib of libraries.values()) {
    try {
      const acf = fs.readFileSync(path.join(lib, 'steamapps', `appmanifest_${STEAM_APP}.acf`), 'utf8');
      const m = /"installdir"\s+"([^"]+)"/.exec(acf);
      if (m) logs.push(path.join(lib, 'steamapps', 'common', m[1], 'UE_game', 'TorchLight', 'Saved', 'Logs', 'UE_game.log'));
    } catch (e) {
      // The game isn't in this library.
    }
  }
  for (const base of ['C:\\Program Files (x86)\\Torchlight Infinite', 'C:\\Program Files\\Torchlight Infinite']) {
    logs.push(path.join(base, 'Game', 'UE_game', 'Torchlight', 'Saved', 'Logs', 'UE_game.log'));
  }
  for (const p of [...logs]) if (virtualStore(p)) logs.push(virtualStore(p));
  const there = logs.map((p) => ({ p, st: statOf(p) })).filter((x) => x.st && x.st.isFile()).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  if (there.length) return there[0].p;
  // UE_game\TorchLight is there: the game is installed, and writes its log on start.
  return logs.find((p) => statOf(path.resolve(p, '..', '..', '..'))) || null;
}
module.exports={find:async chosen=>{settings={logPath:chosen};return findLog();},newestLog};

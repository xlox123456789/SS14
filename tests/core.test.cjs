const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SettingsStore, DEFAULTS } = require('../overlay/src/settings/store');
const { normalizeShortcut } = require('../overlay/src/shared/shortcut');
const { visiblePosition } = require('../overlay/src/shared/position');

function temporary(t) {
  const output = path.resolve(__dirname, '.runs');
  fs.mkdirSync(output, { recursive: true });
  const folder = fs.mkdtempSync(path.join(output, 'unit-'));
  t.after(() => {
    if (!path.resolve(folder).startsWith(output + path.sep)) throw new Error('Unexpected cleanup path');
    fs.rmSync(folder, { recursive: true, force: true });
  });
  return path.join(folder, 'settings.json');
}
test('all preferences persist and callers cannot mutate the store by reference', t => {
  const file = temporary(t), store = new SettingsStore(file);
  assert.equal(store.get().captureShortcut, 'F9');
  const settings = { opacity: 0.65, alwaysOnTop: false, showOnStartup: false, captureShortcut: 'ctrl+shift+f8', position: { x: -300, y: 100 }, targetWindow: { id: 'window:123:0', title: '測試遊戲' }, analysisMode:'manual',autoConsent:true,logPath:path.join(path.dirname(file),'UE_game.log') };
  store.update(settings);
  const restored = new SettingsStore(file).get();
  assert.deepEqual(restored, { ...DEFAULTS, ...settings, captureShortcut: 'Control+Shift+F8' });
  restored.position.x = 9000; assert.equal(store.get().position.x, -300);
});
test('invalid settings are rejected without damaging the persisted file', t => {
  const file = temporary(t), store = new SettingsStore(file); store.update({ opacity: 0.8 });
  const original = fs.readFileSync(file, 'utf8');
  for (const patch of [{ opacity: 0 }, { opacity: NaN }, { alwaysOnTop: 'false' }, { targetWindow: { id: 'screen:0:0', title: '螢幕' } }, { captureShortcut: 'Ctrl+Alt+O' },{analysisMode:'guess'},{autoConsent:'yes'},{logPath:'relative.log'}]) assert.throws(() => store.update(patch));
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});
test('legacy import preserves position only; corrupt settings have a recoverable backup', t => {
  const file = temporary(t);
  fs.writeFileSync(file, JSON.stringify({ overlay: { x: 200, y: 150 }, hideFromCaptures: true, cpu: 'half' }));
  assert.deepEqual(new SettingsStore(file).get(), { ...DEFAULTS, position: { x: 200, y: 150 } });
  fs.writeFileSync(file, '{broken');
  const store = new SettingsStore(file);
  assert.ok(store.warning); assert.equal(fs.readFileSync(`${file}.unreadable-backup`, 'utf8'), '{broken');
  assert.deepEqual(store.get(), DEFAULTS);
});
test('shortcut validation accepts supported combinations and refuses reserved or ambiguous keys', () => {
  assert.equal(normalizeShortcut('f9'), 'F9');
  assert.equal(normalizeShortcut('shift+ctrl+f8'), 'Control+Shift+F8');
  assert.equal(normalizeShortcut('alt+9'), 'Alt+9');
  for (const value of ['A', 'Shift+A', 'Control+Alt+O', 'Alt+F4', 'Control+Control+A', 'F0', 'F25', 'F9+F10', '', 'Meta+A']) assert.throws(() => normalizeShortcut(value), value);
});
test('overlay stays within visible desktop bounds, including a monitor at negative coordinates', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1040 }, second = { x: -1920, y: 0, width: 1920, height: 1080 };
  const input = { primary, areas: [primary, second], width: 360, height: 220 };
  assert.deepEqual(visiblePosition({ ...input, saved: { x: -32000, y: -32000 } }), { x: 1536, y: 80 });
  assert.deepEqual(visiblePosition({ ...input, saved: { x: -1700, y: 90 } }), { x: -1700, y: 90 });
  assert.deepEqual(visiblePosition({ ...input, saved: { x: 1800, y: 980 } }), { x: 1560, y: 820 });
});
test('analyzer and strategy refuse missing capture or board', async () => {
  const { Analyzer } = require('../overlay/src/analyzer');
  const { Strategy } = require('../overlay/src/strategy');
  await assert.rejects(new Analyzer().analyze({}), /缺少截圖/);
  assert.equal((await new Strategy().recommend({})).status,'blocked');
});

test('upstream model persists edits, uncertainty and all internal fields; stale edits cannot overwrite a new scan', t => {
  const { BoardStore, validateDocument } = require('../overlay/src/board/store');
  const M = require('../overlay/vendor/coffeebns/model-core.cjs');
  const input = require('./fixtures/upstream-board.json');
  const store = new BoardStore(temporary(t));
  let doc = store.save(input);
  assert.equal(doc.checks.length, 21);
  assert.equal(M.buildState(doc.model).st.cells.length, 16);
  const previous = structuredClone(doc);
  doc.model.cells[1] = { kind: 'inmate', beast: 'lion', tier: 3, event: 'unknown', marked: true };
  doc = store.edit({ revision: doc.revision, model: doc.model, confirmed: ['cell:1','tools'] });
  assert.ok(doc.checks.includes('cell:1'), 'unknown event cannot be marked confirmed');
  assert.ok(!doc.checks.includes('tools'));
  assert.throws(() => store.edit({ revision: previous.revision, model: previous.model }), /盤面已更新/);
  const restored = new BoardStore(store.file).get();
  assert.deepEqual(restored, doc);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))).model, doc.model);
  for (const mutate of [m => { m.cells[1] = null; }, m => { m.cells[1].tier = 9; }, m => { m.tools = ['bogus']; }, m => { m.dest = '1'; }, m => { m.vault = Array(11).fill('wolf'); }]) {
    const invalid = structuredClone(doc.model); mutate(invalid); assert.throws(() => store.save({ model: invalid }));
  }
  assert.deepEqual(store.get(), doc, 'bad imports must not replace saved board');
});

test('upstream adapter keeps scanner Check states rather than confirming guesses', () => {
  const M = require('../overlay/vendor/coffeebns/model-core.cjs');
  const base = M.blankModel();
  const raw = { cells: Array.from({ length: 16 }, (_, n) => ({ n, kind: n === 0 ? 'office' : 'locked', conf: 1 })), warden: { cell: 0, conf: 1 }, days: { days: 19 }, doors: { cells: [1,2,3], conf: 1 }, tools: { tools: [] } };
  raw.cells[2] = { n: 2, kind: 'inmate', beast: 'lion', tier: 2, conf: .3, jaws: null, event: true };
  const result = M.scanToModel(raw, base);
  assert.ok(result.checks.has(2)); assert.equal(result.model.cells[2].event, 'unknown');
  assert.equal(result.model.cells[2].tier, 2); assert.deepEqual(result.model.dest, [1,2,3]);
});

test('loaded upstream documents receive a revision for UI and strategy freshness checks',t=>{
  const {BoardStore}=require('../overlay/src/board/store');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tartarus-legacy-board-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const file=path.join(folder,'board.json');fs.copyFileSync(path.join(__dirname,'fixtures/upstream-board.json'),file);
  const store=new BoardStore(file);assert.equal(typeof store.get().revision,'string');assert.equal(store.get().revision,store.summary().revision);
});

test('instrument offers preserve mid-run board and reset only on upstream fresh-run evidence', () => {
  const {pickModel} = require('../overlay/src/analyzer/pick-model');
  const base = require('./fixtures/upstream-board.json').model;
  const raw = {ok:true,cards:[{sim:'rope'},{sim:'keys'},{sim:'saw'}],reroll:true};
  const mid = pickModel(raw,base,false,['cell:1']);
  assert.deepEqual(mid.model.cells,require('../overlay/vendor/coffeebns/model-core.cjs').normalize(base).cells); assert.deepEqual(mid.checks,['cell:1','choice']);
  assert.equal(mid.model.choice.rerolls,1); assert.equal(mid.model.step,'choice');
  const fresh = pickModel(raw,base,true,[]);
  assert.equal(fresh.model.runStart,true); assert.equal(fresh.model.day,1);
  assert.equal(fresh.model.cells.filter(c=>c.kind==='inmate').length,0);
  assert.ok(fresh.checks.includes('cell:1'));
});

'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { _electron } = require(playwrightPath);
const executablePath = path.resolve('overlay/node_modules/electron/dist/electron.exe');
const output = path.resolve('tests/.runs'); fs.mkdirSync(output, { recursive: true });
const run = fs.mkdtempSync(path.join(output, 'desktop-'));
const profile = path.join(run, 'app');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let app, target;
const errors = [], requests = [];
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitState(page, predicate, timeout=25000) {
  const start=Date.now();
  for (;;) {
    const snapshot=(await page.evaluate(()=>window.overlayApp.getState())).value;
    if (predicate(snapshot)) return snapshot;
    if (Date.now()-start>timeout) throw new Error(`State timeout: ${JSON.stringify(snapshot.auto)}`);
    await wait(100);
  }
}
async function launch() {
  const instance = await _electron.launch({ executablePath, args: [path.resolve('overlay'), `--user-data=${profile}`], env, timeout: 30000 });
  function watch(page) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  }
  instance.windows().forEach(watch); instance.on('window', watch);
  return instance;
}
async function overlayPage(instance) {
  for (let i = 0; i < 100; i++) {
    const page = instance.windows().find(p => p.url().includes('/overlay/index.html'));
    if (page) { await page.waitForLoadState(); return page; }
    await wait(100);
  }
  throw new Error('Overlay page not created');
}
async function settingsPage(instance, overlay) {
  await overlay.locator('#settings').click();
  for (let i = 0; i < 100; i++) {
    const page = instance.windows().find(p => p.url().includes('/settings/index.html'));
    if (page) { await page.waitForLoadState(); await page.waitForFunction(() => document.getElementById('capture-shortcut').value === 'F9' || document.getElementById('capture-shortcut').value.includes('F8')); return page; }
    await wait(100);
  }
  throw new Error('Settings page not created');
}
async function windowInfo() {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/overlay/index.html'));
    return { visible: w.isVisible(), top: w.isAlwaysOnTop(), opacity: w.getOpacity(), focusable: w.isFocusable(), bounds: w.getBounds() };
  });
}
(async () => {
  try {
    target = await _electron.launch({ executablePath, args: [path.resolve('tests/fixtures/capture-target.cjs'), `--user-data-dir=${path.join(run, 'target')}`], env, timeout: 30000 });
    await (await target.firstWindow()).waitForLoadState();
    app = await launch();
    let overlay = await overlayPage(app);
    assert.deepEqual((await overlay.evaluate(() => window.overlayApp.getState())).value.settings.captureShortcut, 'F9');
    let info = await windowInfo(); assert.equal(info.visible, true); assert.equal(info.top, true); assert.equal(info.focusable, false);
    let settings = await settingsPage(app, overlay);
    assert.equal((await windowInfo()).visible, true, 'settings must not replace overlay');
    await settings.locator('#test-capture').click();
    await settings.waitForFunction(() => document.getElementById('capture-status').textContent.includes('選擇遊戲視窗'));
    await settings.locator('#refresh-windows').click();
    await settings.waitForFunction(() => [...document.querySelectorAll('#target-window option')].some(o => o.textContent === '浮層截圖測試視窗'));
    const targetID = await settings.locator('#target-window option').evaluateAll(options => options.find(o => o.textContent === '浮層截圖測試視窗').value);
    await settings.locator('#target-window').selectOption(targetID);
    await settings.locator('#test-capture').click();
    await settings.waitForFunction(() => document.getElementById('capture-status').textContent.includes('截圖成功'), null, { timeout: 25000 });
    const captured = (await settings.evaluate(() => window.overlayApp.getState())).value.capture.last;
    assert.ok(captured.width >= 600 && captured.height >= 400); assert.ok(fs.existsSync(captured.imagePath));
    const pixels = await app.evaluate(({ nativeImage }, filename) => {
      const bitmap = nativeImage.createFromPath(filename).toBitmap(); let blue = 0, orange = 0;
      for (let i = 0; i < bitmap.length; i += 16) {
        const b = bitmap[i], g = bitmap[i + 1], r = bitmap[i + 2];
        if (b > 70 && g > 50 && r < 70) blue++;
        if (r > 180 && g > 90 && g < 200 && b < 120) orange++;
      }
      return { blue, orange };
    }, captured.imagePath);
    assert.ok(pixels.blue > 1000 && pixels.orange > 1000, `capture pixels: ${JSON.stringify(pixels)}`);
    fs.copyFileSync(captured.imagePath, path.join(output, 'capture-preview.png'));
    console.log(`PASS real window capture: ${captured.width}×${captured.height}, expected colored pixels`);
    await settings.locator('#opacity').fill('72');
    await settings.locator('#always-on-top').uncheck();
    await settings.locator('#show-on-startup').uncheck();
    await settings.locator('#capture-shortcut').fill('Ctrl+Shift+F8');
    await settings.locator('#save').click();
    await settings.waitForFunction(() => document.getElementById('save-status').textContent.includes('設定已儲存'));
    info = await windowInfo(); assert.ok(Math.abs(info.opacity - 0.72) < 0.02); assert.equal(info.top, false);
    const registered = await app.evaluate(({ globalShortcut }) => ({ old: globalShortcut.isRegistered('F9'), next: globalShortcut.isRegistered('Control+Shift+F8') }));
    assert.deepEqual(registered, { old: false, next: true });
    // Real native capture -> ORIGINAL scan worker. This non-game window must fail.
    const noBoard = await overlay.evaluate(() => window.overlayApp.analyzeCapture());
    assert.equal(noBoard.ok, false); assert.match(noBoard.error,/未找到SS14盤面/);
    const latest = (await overlay.evaluate(() => window.overlayApp.getState())).value.capture.last;
    const { Analyzer } = require('../overlay/src/analyzer');
    const bridged = await new Analyzer().analyze(latest);
    const scanner = require('../overlay/vendor/coffeebns/js/scan');
    const png = require('../overlay/vendor/coffeebns/tools/png');
    const reference = require('../overlay/vendor/coffeebns/js/scan-data');
    const picks = require('../overlay/vendor/coffeebns/js/pick-data');
    const direct = scanner.scan(png.read(latest.imagePath),scanner.withPanelIcons(reference,picks),{lang:'zh'});
    delete direct.ms; delete bridged.raw.ms;
    assert.deepEqual(bridged.raw,direct,'native bridge matches original scanner (negative image)');
    assert.equal(bridged.ok,false);
    const lateOffer = await new Analyzer().analyze({...latest,kind:'instruments'});
    delete lateOffer.raw.ms;
    assert.deepEqual(lateOffer.raw,direct,'missed instrument popup falls back to original board scanner');
    if (process.argv.includes('--native-hotkey')) {
      const registration = await settings.evaluate(()=>window.overlayApp.saveSettings({captureShortcut:'F9',analysisMode:'manual'}));
      assert.equal(registration.ok,true);
      console.log('READY_NATIVE_F9: press F9 with the 浮層截圖測試視窗 focused.');
      await waitState(settings,s=>s.capture.last?.id!==latest.id && s.analysis.status==='error',60000);
      assert.equal((await settings.evaluate(()=>window.overlayApp.getState())).value.capture.last.sourceTitle,'浮層截圖測試視窗');
      console.log('PASS actual Windows F9 input -> selected native window capture -> upstream scanner rejects non-game.');
      await settings.evaluate(()=>window.overlayApp.saveSettings({captureShortcut:'Control+Shift+F8'}));
    }
    // Public upstream board model exercises UI editing, not recognition accuracy.
    await overlay.locator('#board').click();
    const board = await app.waitForEvent('window', { predicate:p=>p.url().includes('/board/index.html') }).catch(()=>null);
    const boardPage = board || app.windows().find(p=>p.url().includes('/board/index.html'));
    await boardPage.waitForLoadState();
    const imported = path.join(run,'import.json'), exported = path.join(run,'export.json');
    fs.copyFileSync(path.resolve('tests/fixtures/upstream-board.json'),imported);
    await app.evaluate(({dialog},file)=> { dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]}); },imported);
    await boardPage.locator('#import').click();
    await boardPage.waitForSelector('.cell[data-cell="1"]');
    await boardPage.locator('.cell[data-cell="1"]').click();
    await boardPage.locator('#kind').selectOption('inmate'); await boardPage.locator('#beast').selectOption('lion'); await boardPage.locator('#tier').selectOption('3'); await boardPage.locator('#event').selectOption('');
    await boardPage.locator('#apply').click();
    await boardPage.waitForFunction(()=>document.querySelector('.cell[data-cell="1"] .name').textContent.includes('獅子 · 傳奇'));
    assert.ok(!JSON.parse(fs.readFileSync(path.join(profile,'board.json'),'utf8')).checks.includes('cell:1'));
    await boardPage.locator('#tools input[value="rope"]').check();
    await boardPage.locator('#vault').fill('2');
    await boardPage.locator('#meta-form button[type="submit"]').click();
    await boardPage.waitForFunction(()=>document.getElementById('summary').textContent.includes('彩色 2'));
    await app.evaluate(({dialog},file)=> { dialog.showSaveDialog=async()=>({canceled:false,filePath:file}); },exported);
    await boardPage.locator('#export').click(); await wait(200);
    const savedBoard = JSON.parse(fs.readFileSync(path.join(profile,'board.json'),'utf8'));
    assert.deepEqual(JSON.parse(fs.readFileSync(exported,'utf8')).model,savedBoard.model);
    assert.ok(savedBoard.model.tools.includes('rope'));
    fs.writeFileSync(imported,'{"broken":true}'); await boardPage.locator('#import').click();
    await boardPage.waitForFunction(()=>document.getElementById('notice').textContent.includes('16 格'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'board.json'),'utf8')).revision,savedBoard.revision);
    await boardPage.evaluate(()=>document.getElementById('notice').textContent='');
    await boardPage.screenshot({path:path.join(output,'board-preview.png'),fullPage:true});
    // Automatic replay uses actual capture + scanner, with constructed upstream event lines.
    const log = path.join(run,'UE_game.log'); fs.writeFileSync(log,'old lines\n');
    const configured = await settings.evaluate(logPath=>window.overlayApp.saveSettings({analysisMode:'auto',autoConsent:true,logPath}),log);
    assert.equal(configured.ok,true);
    await waitState(settings,s=>s.auto.status==='monitoring');
    fs.appendFileSync(log,'[replay-1] TLLua: UI_S16_Card_Up\n');
    await waitState(settings,s=>s.auto.captures===1);
    const autoResult = (await settings.evaluate(()=>window.overlayApp.getState())).value;
    fs.copyFileSync(autoResult.capture.last.imagePath,path.join(output,'auto-capture-preview.png'));
    assert.match(autoResult.analysis.message,/未找到SS14盤面/);
    assert.match(await overlay.locator('#auto-status').textContent(),/正在監控/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'board.json'),'utf8')).revision,savedBoard.revision,'failed auto scan keeps corrected board');
    await settings.evaluate(()=>window.overlayApp.saveSettings({analysisMode:'manual'}));
    assert.equal((await settings.evaluate(()=>window.overlayApp.getState())).value.auto.status,'manual');
    console.log('PASS native capture -> upstream scanner parity (non-game rejected); upstream model import; click edit; tools edit; export; invalid import rollback; event-triggered real capture; manual switch.');
    assert.equal(await app.evaluate(({ globalShortcut }) => globalShortcut.register('Control+Shift+F10', () => {})), true);
    await settings.locator('#capture-shortcut').fill('Control+Shift+F10'); await settings.locator('#save').click();
    await settings.waitForFunction(() => document.getElementById('save-status').textContent.includes('已被其他程式使用'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).captureShortcut, 'Control+Shift+F8');
    assert.equal(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Shift+F8')), true);
    await app.evaluate(({ globalShortcut }) => globalShortcut.unregister('Control+Shift+F10'));
    await settings.locator('#capture-shortcut').fill('Control+Shift+F8');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/overlay/index.html')).setPosition(980, 240));
    await wait(350);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).position, { x: 980, y: 240 });
    await settings.locator('#reset-position').click(); await wait(250);
    const reset = (await windowInfo()).bounds; assert.ok(reset.x >= 0 && reset.y >= 0 && reset.x !== 980);
    await overlay.locator('#hide').click(); assert.equal((await windowInfo()).visible, false);
    await settings.locator('#show-overlay').click(); assert.equal((await windowInfo()).visible, true);
    await overlay.locator('#fold').click(); await wait(150);
    assert.ok((await windowInfo()).bounds.height < 80);
    await overlay.locator('#fold').click(); await wait(150);
    await settings.screenshot({ path: path.join(output, 'settings-preview.png'), fullPage: true });
    await overlay.screenshot({ path: path.join(output, 'overlay-preview.png') });
    // Close/relaunch the process to verify native state as well as stored JSON.
    await app.close(); app = null;
    app = await launch(); overlay = await overlayPage(app); info = await windowInfo();
    assert.equal(info.visible, false, 'show-on-startup false must survive restart');
    assert.equal(info.top, false); assert.ok(Math.abs(info.opacity - 0.72) < 0.02);
    const restored = (await overlay.evaluate(() => window.overlayApp.getState())).value.settings;
    const restoredBoard = (await overlay.evaluate(()=>window.overlayApp.getBoard())).value;
    assert.deepEqual(restoredBoard.model,savedBoard.model);
    assert.equal(restored.targetWindow.title, '浮層截圖測試視窗'); assert.equal(restored.captureShortcut, 'Control+Shift+F8');
    assert.equal(restored.position.x, reset.x); assert.equal(restored.position.y, reset.y);
    await overlay.evaluate(() => window.overlayApp.showOverlay());
    settings = await settingsPage(app, overlay);
    await settings.locator('#test-capture').click();
    await settings.waitForFunction(() => document.getElementById('capture-status').textContent.includes('截圖成功'), null, { timeout: 25000 });
    // A stale handle is safely re-resolved by one unambiguous saved title.
    const stale = await settings.evaluate(() => window.overlayApp.testCapture({ id: 'window:123456789:0', title: '浮層截圖測試視窗' }));
    assert.equal(stale.ok, true, JSON.stringify(stale));
    await target.close(); target = null;
    await settings.locator('#test-capture').click();
    await settings.waitForFunction(() => document.getElementById('capture-status').textContent.includes('找不到選定'));
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    console.log('PASS gear opens separate settings; native opacity/topmost; hide/show/fold; position save/reset; shortcut conflict rollback; full process restart; stale/closed target handling; no HTTP requests or renderer errors.');
  } finally {
    if (app) await app.close().catch(() => {});
    if (target) await target.close().catch(() => {});
    const resolved = path.resolve(run);
    if (resolved.startsWith(output + path.sep)) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

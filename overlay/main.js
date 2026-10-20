'use strict';

const { app, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen, dialog, shell, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { SettingsStore } = require('./src/settings/store');
const { OverlayController } = require('./src/overlay/controller');
const { SettingsWindow } = require('./src/settings/window');
const { CaptureService } = require('./src/capture/service');
const { Analyzer } = require('./src/analyzer');
const { BoardStore } = require('./src/board/store');
const { BoardWindow } = require('./src/board/window');
const fs = require('node:fs/promises');
const { AutoService } = require('./src/auto/service');
const logFinder = require('./vendor/coffeebns/find-log.cjs');
const {Diagnostics}=require('./src/shared/diagnostics');
const {Strategy}=require('./src/strategy');
const {VisualWatch}=require('./src/auto/visual-watch');
const {migrateProfile}=require('./src/settings/migrate');

const option = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
if (option('user-data')) app.setPath('userData', path.resolve(option('user-data')));
else {app.setPath('userData',path.join(app.getPath('appData'),'SS14'));migrateProfile(app.getPath('appData'),app.getPath('userData'));}
app.setName('SS14');
app.setAppUserModelId('local.ss14.overlay');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const icon = path.join(__dirname, 'build/icon.png');
let store, overlay, settingsWindow, capture, tray;
let analyzer, boards, boardWindow, analyzing = false, capturing = false;
let analysisState = { status: 'idle', message: '等待截圖' };
let auto;
let quitting = false;
let captureHotkey = null;
let shortcutWarning = '';
let captureState = { status: 'idle', message: '尚未截圖', last: null };
let diagnostics,publishTimer,diagnosticTimer,jobSequence=0;
let publishedPhase=null;
let visualWatch;
function watchDecisions(){
  if(!auto?.active||!boards.get()||analyzing||capturing)return;
  void visualWatch.start(store.get().targetWindow).then(()=>{if(visualWatch.timer)diagnostics.value.visualWatch='已啟用（決策區每 0.1 秒檢查）';});
}
let strategy, strategySequence=0,boardEventSequence=0,advice={status:'idle',message:'完成盤面辨識後顯示建議走法。'};
function invalidateAdvice(message='盤面正在更新，等待新建議。'){
  ++strategySequence;strategy?.cancel();advice={status:'idle',message};
}
async function recommendBoard(){
  const doc=boards.get();if(!doc){invalidateAdvice('尚無盤面可計算建議。');publish();return;}
  const sequence=++strategySequence;
  advice={status:'busy',revision:doc.revision,message:'正在計算建議走法…'};publish();
  diagnostics.record('strategy.start',{revision:doc.revision});
  try{
    const result=await strategy.recommend(doc);
    if(sequence!==strategySequence||boards.summary().revision!==doc.revision||quitting)return;
    const {raw,problems,error,...compact}=result;
    advice=compact;
    diagnostics.value.strategy={status:result.status,at:new Date().toISOString(),elapsedMs:result.elapsedMs,rounds:result.rounds,provisional:result.provisional};
    diagnostics.record('strategy.complete',{revision:doc.revision,status:result.status,action:result.action,rounds:result.rounds,durationMs:result.elapsedMs,problems,error});
    diagnostics.value.metrics.strategyWorkerStarts=strategy.starts;
  }catch(error){if(sequence===strategySequence){advice={status:'error',revision:doc.revision,message:error.message};diagnostics.record('strategy.error',{error:error.message});}}
  publish();
}
const captureInfo=result=>{if(!result)return null;const {dataUrl,...info}=result;return info;};
app.on('web-contents-created',(_event,contents)=>{
  contents.on('console-message',details=>{if(details.level==='error')diagnostics?.record('ui.error',{error:details.message,source:details.sourceId,line:details.lineNumber});});
  contents.on('render-process-gone',(_event,details)=>{
    const message=`介面程序已停止（${details.reason}）。請重新啟動工具。`;
    if(diagnostics)diagnostics.value.lastError={at:new Date().toISOString(),message};
    diagnostics?.record('ui.process.error',{error:message});
  });
});

function state() {
  return { settings: store.get(), overlayVisible: overlay.isVisible(), capture: {...captureState,last:captureInfo(captureState.last)}, auto: auto?.snapshot(), analysis: { ...analysisState,...boards.summary(),warning: boards.warning }, advice, shortcutWarning, settingsWarning: store.warning };
}
function publish() {
  if(publishTimer || quitting)return;
  publishTimer=setTimeout(()=>{publishTimer=null;publishNow();},50);
}
function publishNow() {
  if(quitting)return;
  const started=performance.now();
  const snapshot = state();
  for(const controller of [overlay,settingsWindow,boardWindow]){
    try{controller.publish(snapshot);}catch(error){diagnostics.record('ui.publish.error',{error:error.message});}
  }
  if(snapshot.analysis.jobState!==publishedPhase){publishedPhase=snapshot.analysis.jobState;diagnostics.record('ui.state.sent',{jobState:publishedPhase,durationMs:performance.now()-started});}
}
function toggleOverlay() {
  overlay.isVisible() ? overlay.hide() : overlay.show();
  publish(); rebuildTray();
}
function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: overlay.isVisible() ? '隱藏小浮層' : '顯示小浮層', click: toggleOverlay },
    { label: '設定', click: () => settingsWindow.open() },
    { label: '截圖分析', accelerator: captureHotkey || undefined, click: () => takeAnalysis({kind:'manual',source:'tray'}) },
    { label: '查看盤面', click: () => boardWindow.open() },
    { type: 'separator' },
    { label: '重設小浮層位置', click: () => resetPosition() },
    { label: `版本 ${app.getVersion()}`, enabled: false },
    { label: '結束程式', click: () => app.quit() },
  ]));
}
function registerCaptureShortcut(shortcut) {
  if (!globalShortcut.register(shortcut, () => takeAnalysis({kind:'manual',source:'hotkey'}))) throw new Error('這組快捷鍵已被其他程式使用，請選擇另一組。');
}
function saveSettings(patch) {
  const allowed = ['opacity', 'alwaysOnTop', 'showOnStartup', 'captureShortcut', 'targetWindow', 'analysisMode', 'autoConsent', 'logPath'];
  if (!patch || Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('設定內容不正確。');
  const next = store.validate(patch);
  const oldShortcut = captureHotkey;
  const changeShortcut = next.captureShortcut !== oldShortcut;
  if (changeShortcut) registerCaptureShortcut(next.captureShortcut);
  try { store.update(patch); }
  catch (error) { if (changeShortcut) globalShortcut.unregister(next.captureShortcut); throw error; }
  if (changeShortcut) {
    if (oldShortcut) globalShortcut.unregister(oldShortcut);
    captureHotkey = next.captureShortcut;
  }
  shortcutWarning = '';
  overlay.applySettings(store.get());
  auto?.configure(store.get());
  visualWatch?.stop();diagnostics.value.visualWatch='已停用';watchDecisions();
  rebuildTray(); publish();
  return state();
}
function resetPosition() {
  const position = overlay.resetPosition();
  store.update({ position }); publish();
  return position;
}
async function takeCapture(target) {
  if (capturing || capture.busy) return { ok: false, error: '正在截圖，請稍候。' };
  capturing = true;
  captureState = { ...captureState, status: 'busy', message: '正在擷取遊戲畫面…' }; publish();
  try {
    const started=performance.now();diagnostics.record('capture.start');
    // Window-only capture excludes other windows. Keep the UI interactive.
    const result = await capture.take(target === undefined ? store.get().targetWindow : target);
    diagnostics.value.lastCapture=result.capturedAt;
    diagnostics.record('capture.complete',{durationMs:performance.now()-started,width:result.width,height:result.height});
    captureState = { status: 'success', message: `截圖成功：${result.width} × ${result.height}`, last: result };
    publish(); return { ok: true, capture: result };
  } catch (error) {
    captureState = { ...captureState, status: 'error', message: error.message }; publish();
    return { ok: false, error: error.message };
  } finally {
    capturing = false;
    publish();
  }
}
async function takeAnalysis(request = 'manual') {
  const kind = typeof request === 'string' ? request : request.kind;
  const source=typeof request==='object' ? request.source||'auto' : 'button';
  const jobId=++jobSequence,started=performance.now();
  diagnostics.record('analysis.request',{jobId,source,kind});
  const previous = boards.get();
  const fresh = typeof request === 'object' && typeof request.fresh === 'boolean' ? request.fresh : kind === 'manual' && (!previous || Date.now()-Date.parse(previous.capturedAt || previous.updatedAt)>300000 || !!previous.model.runStart);
  if (analyzing || capturing || capture.busy) {diagnostics.record('analysis.busy',{jobId,source});return { ok: false, error: '目前正在截圖或辨識，請等待這次工作完成。' };}
  if (kind === 'treasure') {
    invalidateAdvice('等待寶藏後的完整盤面。');
    analysisState = { status:'idle', message:'偵測到典獄長寶藏，等待完整盤面' }; publish(); return { ok:true, waiting:true };
  }
  analyzing = true;
  const eventAtStart=boardEventSequence;
  invalidateAdvice();
  let captured = false;
  try {
    diagnostics.value.jobState='Capturing';
    auto?.workState('Capturing');
    analysisState = { status: 'busy', message: '正在截圖',jobState:'Capturing' }; publishNow();
    const shot = await takeCapture();
    if (!shot.ok) throw new Error(shot.error);
    captured = true;
    diagnostics.value.jobState='Analyzing';
    auto?.workState('Analyzing');
    analysisState = { status: 'busy', message: '正在辨識',jobState:'Analyzing' }; publishNow();
    const scanStart=performance.now();diagnostics.record('scan.start',{jobId});
    const result = await analyzer.analyze({ ...shot.capture, kind, fresh, checks:boards.get()?.checks }, boards.get()?.model);
    diagnostics.value.lastAnalysis=new Date().toISOString();diagnostics.value.lastAnalysisMs=performance.now()-scanStart;
    diagnostics.value.metrics.workerStarts=analyzer.starts;
    diagnostics.record('scan.complete',{jobId,durationMs:diagnostics.value.lastAnalysisMs,ok:result.ok,error:result.error,timing:result.timing});
    if(result.error)throw new Error(`辨識執行失敗：${result.error}`);
    if (!result.ok) throw new Error(kind === 'objective' ? '目標文字待確認；請關閉目標視窗，等待完整盤面再辨識。' : '未找到SS14盤面。請完整顯示盤面、關閉遮擋視窗後再按 F9。');
    const doc = boards.save({ ...result, capturedAt: shot.capture.capturedAt, sourceTitle: shot.capture.sourceTitle });
    analysisState = { status: 'success', message: doc.checks.length ? `${doc.checks.length} 個項目待確認` : '辨識完成',jobState:'Completed' };
    diagnostics.value.jobState='Completed';diagnostics.record('analysis.complete',{jobId,durationMs:performance.now()-started,revision:doc.revision});
    if(eventAtStart===boardEventSequence)void recommendBoard();
    else invalidateAdvice('偵測到較新的遊戲階段，等待下一次盤面更新。');
    publish(); return { ok: true };
  } catch (error) {
    visualWatch?.stop();
    diagnostics.value.jobState='Error';diagnostics.value.lastError={at:new Date().toISOString(),message:error.message,jobId};
    diagnostics.record('analysis.error',{jobId,source,durationMs:performance.now()-started,error:error.message,stack:error.stack});
    analysisState = { status: 'error', message: error.message || '辨識失敗，請重新截圖。',jobState:'Error' }; publish();
    invalidateAdvice('截圖或辨識失敗，請重試後取得新建議。');
    return { ok: false, error: analysisState.message, stage:captured ? 'scan' : 'capture' };
  } finally { analyzing = false;if(analysisState.status==='success')watchDecisions();if(auto?.active){diagnostics.value.jobState=auto.follow?'Monitoring':'Idle';auto.workState(diagnostics.value.jobState);}auto?.wake();publish(); }
}
function installIPC() {
  const pages = {
    overlay: pathToFileURL(path.join(__dirname, 'src/overlay/index.html')).href,
    settings: pathToFileURL(path.join(__dirname, 'src/settings/index.html')).href,
    board: pathToFileURL(path.join(__dirname, 'src/board/index.html')).href,
  };
  function fromApp(event) {
    return event.senderFrame === event.sender.mainFrame && (
      (event.sender === overlay.window?.webContents && event.senderFrame.url === pages.overlay) ||
      (event.sender === settingsWindow.window?.webContents && event.senderFrame.url === pages.settings) ||
      (event.sender === boardWindow.window?.webContents && event.senderFrame.url === pages.board)
    );
  }
  const handle = (name, action) => ipcMain.handle(name, async (event, ...args) => {
    if (!fromApp(event)) return { ok: false, error: '無法執行此操作。' };
    try { return { ok: true, value: await action(...args) }; }
    catch (error) { return { ok: false, error: error.message || '操作失敗，請重試。' }; }
  });
  handle('app:state', state);
  handle('diagnostics:get',()=>diagnostics.snapshot());
  handle('diagnostics:copy',async()=>{await clipboard.writeText(JSON.stringify({...diagnostics.snapshot(),monitor:auto.snapshot()},null,2));return true;});
  handle('capture:preview',id=>{if(id!==captureState.last?.id)throw new Error('截圖已更新，請重新取得預覽。');return captureState.last.dataUrl;});
  handle('settings:open', () => settingsWindow.open());
  handle('auto:find-log', () => logFinder.find(store.get().logPath));
  handle('auto:choose-log', async () => {
    const result = await dialog.showOpenDialog(settingsWindow.window, { title:'選擇 UE_game.log', filters:[{name:'遊戲 Log',extensions:['log']}], properties:['openFile'] });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('credits:open', name => {
    const links = { github: 'https://github.com/blahdot3h/tartarus-simulator', twitch: 'https://www.twitch.tv/coffeebns', youtube: 'https://www.youtube.com/@CoffeeBns' };
    if (!Object.hasOwn(links, name)) throw new Error('連結不正確。');
    return shell.openExternal(links[name]);
  });
  handle('analysis:take', async () => {diagnostics.record('ipc.analysis.click'); const result = await takeAnalysis(); if (!result.ok) throw new Error(result.error); return result; });
  handle('board:open', () => boardWindow.open());
  handle('strategy:recommend',()=>{if(analyzing)throw new Error('正在辨識，請稍候再計算。');return recommendBoard();});
  handle('board:get', () => boards.view());
  handle('board:edit', patch => {
    if (analyzing) throw new Error('正在辨識，請稍候再修正。');
    const doc = boards.edit(patch);
    void recommendBoard();
    analysisState = { status: 'success', message: doc.checks.length ? `${doc.checks.length} 個項目待確認` : '盤面已確認' }; publish(); return doc;
  });
  handle('board:reload', () => { if(analyzing)throw new Error('正在辨識，請稍候再載入。');const doc = boards.load();void recommendBoard();publish();return doc; });
  handle('board:import', async () => {
    if (analyzing) throw new Error('正在辨識，請稍候再匯入。');
    const result = await dialog.showOpenDialog(boardWindow.window, { title: '匯入盤面', filters: [{ name: '盤面 JSON', extensions: ['json'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    if ((await fs.stat(result.filePaths[0])).size > 8 * 1024 * 1024) throw new Error('盤面檔案過大。');
    let input; try { input = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')); } catch { throw new Error('無法讀取 JSON 盤面。'); }
    if (analyzing) throw new Error('正在辨識，請稍候再匯入。');
    const doc = boards.save(input); analysisState = { status: 'success', message: `${doc.checks.length} 個項目待確認` };void recommendBoard();publish();return doc;
  });
  handle('board:export', async () => {
    const doc = boards.get(); if (!doc) throw new Error('尚無盤面可匯出。');
    const result = await dialog.showSaveDialog(boardWindow.window, { title: '匯出盤面', defaultPath: 'SS14盤面.json', filters: [{ name: '盤面 JSON', extensions: ['json'] }] });
    if (!result.canceled) await fs.writeFile(result.filePath, JSON.stringify(doc, null, 2));
    return !result.canceled;
  });
  handle('settings:save', saveSettings);
  handle('settings:reset-position', resetPosition);
  handle('overlay:hide', () => { overlay.hide(); publish(); rebuildTray(); });
  handle('overlay:show', () => { overlay.show(); publish(); rebuildTray(); });
  handle('capture:windows', () => capture.listWindows());
  handle('capture:test', async target => {
    if (analyzing) throw new Error('正在辨識，請稍候再測試截圖。');
    const result = await takeCapture(target);
    if (!result.ok) throw new Error(result.error);
    return result.capture;
  });
  ipcMain.on('overlay:height', (event, height) => {
    if (event.sender === overlay.window?.webContents && event.sender.getURL() === pages.overlay) overlay.resize(height);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (overlay) { overlay.show(); publish(); } });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(publishTimer);clearInterval(diagnosticTimer);diagnostics?.dispose();
    visualWatch?.stop();auto?.dispose();strategy?.dispose();overlay?.flushPosition();overlay?.dispose();settingsWindow?.dispose();boardWindow?.dispose();capture?.dispose();analyzer?.dispose();
    globalShortcut.unregisterAll();
  });
  app.whenReady().then(() => {
    diagnostics=new Diagnostics(path.join(app.getPath('userData'),'logs'));
    store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    overlay = new OverlayController({ icon, settings: store.get(), screen });
    settingsWindow = new SettingsWindow({ icon, screen });
    capture = new CaptureService({ folder: path.join(app.getPath('userData'), 'captures') });
    analyzer = new Analyzer(); boards = new BoardStore(path.join(app.getPath('userData'), 'board.json'));
    strategy=new Strategy();
    boardWindow = new BoardWindow({ icon, screen });
    auto = new AutoService({ analyze: (kind,fresh) => takeAnalysis({kind,fresh,source:'auto'}), busy: () => analyzing || capturing || capture.busy,diagnostics,
      remember: logPath => { if (store.get().logPath !== logPath) { try { store.update({logPath}); } catch {} } },
    });
    visualWatch=new VisualWatch({capture,busy:()=>analyzing||capturing||capture.busy||auto.running,
      onChange:()=>{
        if(!auto.active)return;
        ++boardEventSequence;invalidateAdvice('決策畫面已變更，正在更新盤面。');
        diagnostics.record('visual.change');
        auto.update({message:'偵測到決策畫面變更'});
        void auto.dispatch(auto.epoch,0,'board',false);
      },
      onError:error=>{diagnostics.record('visual.error',{error:error.message});diagnostics.value.visualWatch='檢查暫停；Log 與 F9 仍可使用';},
    });
    let lastEventCount=0;
    auto.on('state',()=>{if(auto.state.events!==lastEventCount){lastEventCount=auto.state.events;++boardEventSequence;invalidateAdvice('遊戲階段已變更，等待最新盤面。');}publish();});
    if (boards.get()) analysisState = { status: 'success', message: `已載入最近盤面 · ${boards.get().checks.length} 個項目待確認` };
    installIPC();
    // Saved boards remain inspectable; get a fresh frame before advising live play.
    if(boards.get())advice={status:'idle',message:'已載入上次盤面。請截圖更新，或在盤面視窗按「計算建議」。'};
    overlay.on('position', position => {
      try { store.update({ position }); }
      catch { shortcutWarning = '無法儲存浮層位置，請檢查設定資料夾。'; }
    });
    overlay.on('ready', publish); settingsWindow.on('ready', publish);
    boardWindow.on('ready', publish);
    overlay.create();
    diagnosticTimer=setInterval(()=>{if(settingsWindow.window?.isVisible())settingsWindow.window.webContents.send('diagnostics:changed',diagnostics.snapshot());},1000);
    auto.configure(store.get());
    // Reconnect an already running prison board once; never replay old Log lines.
    if(auto.active&&boards.get()&&!option('user-data')){
      setTimeout(()=>{if(auto.active)void auto.dispatch(auto.epoch,0,'board',false);},1000);
    }
    try { registerCaptureShortcut(store.get().captureShortcut); captureHotkey = store.get().captureShortcut; }
    catch (error) { shortcutWarning = error.message; }
    if (!globalShortcut.register('Control+Alt+O', toggleOverlay)) shortcutWarning += `${shortcutWarning ? ' ' : ''}Ctrl＋Alt＋O 無法註冊，請使用托盤顯示浮層。`;
    let trayImage = nativeImage.createFromPath(icon);
    if (!trayImage.isEmpty()) trayImage = trayImage.resize({ width: 16, height: 16 });
    tray = new Tray(trayImage); tray.setToolTip('SS14小浮層');
    tray.on('click', () => { overlay.show(); publish(); rebuildTray(); });
    rebuildTray();
    if (store.get().showOnStartup || process.argv.includes('--small-window')) overlay.show();
    if (shortcutWarning || store.warning) settingsWindow.open();
    screen.on('display-removed', () => overlay.ensureOnScreen());
    screen.on('display-metrics-changed', () => overlay.ensureOnScreen());
  }).catch(error => {
    console.error(error);
    if (!quitting) dialog.showErrorBox('程式無法啟動', 'SS14小浮層啟動失敗。請確認設定資料夾可供讀寫，然後重新啟動。');
    app.quit();
  });
}

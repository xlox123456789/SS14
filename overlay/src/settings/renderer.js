'use strict';
const api = window.overlayApp, $ = id => document.getElementById(id);
let ready = false, saving = false, targetDraft = null, lastPreview = null;
function notice(text, tone = '') { $('save-status').textContent = text; $('save-status').dataset.tone = tone; }
function dirty() { $('dirty-note').textContent = '有尚未儲存的變更'; }
function opacityText() { $('opacity-value').textContent = `${$('opacity').value}% 不透明`; }
function selectedTarget() {
  const option = $('target-window').selectedOptions[0];
  return option?.value ? { id: option.value, title: option.dataset.title } : null;
}
function setTargetOptions(windows, target) {
  const select = $('target-window'); select.replaceChildren();
  const empty = document.createElement('option'); empty.value = ''; empty.textContent = '尚未選擇'; select.append(empty);
  if (target && !windows.some(w => w.id === target.id && w.title === target.title)) windows = [{ ...target, missing: true }, ...windows];
  for (const item of windows) {
    const option = document.createElement('option'); option.value = item.id; option.dataset.title = item.title;
    option.textContent = item.missing ? `${item.title}（目前未列出，可重新選擇）` : item.title;
    option.selected = !!target && item.id === target.id && item.title === target.title;
    select.append(option);
  }
}
async function refreshWindows() {
  $('refresh-windows').disabled = true;
  try {
    const result = await api.listWindows();
    if (!result.ok) throw new Error(result.error);
    setTargetOptions(result.value, ready ? selectedTarget() : targetDraft);
  } catch (error) { notice(error.message || '無法取得視窗清單。', 'error'); }
  finally { $('refresh-windows').disabled = false; }
}
function hydrate(settings) {
  $('opacity').value = Math.round(settings.opacity * 100); opacityText();
  $('always-on-top').checked = settings.alwaysOnTop; $('show-on-startup').checked = settings.showOnStartup;
  $('capture-shortcut').value = settings.captureShortcut; targetDraft = settings.targetWindow;
  $('analysis-mode').value = settings.analysisMode; $('auto-consent').checked = settings.autoConsent; $('log-path').value = settings.logPath;
  setTargetOptions([], targetDraft); $('dirty-note').textContent = '';
}
function render(state) {
  if (!ready) { hydrate(state.settings); ready = true; refreshWindows(); }
  $('startup-warning').hidden = !(state.shortcutWarning || state.settingsWarning);
  $('startup-warning').textContent = [state.shortcutWarning, state.settingsWarning].filter(Boolean).join(' ');
  if (state.auto) {
    $('auto-status').textContent = state.auto.message;
    $('diagnostic-summary').textContent = `進度：${state.auto.progress} · 讀取 ${state.auto.lines} 行 · ${state.auto.events} 個事件 · ${state.auto.captures} 次自動分析\nLog：${state.auto.logPath || '尚未找到'}\n詳細 Log：${state.auto.detail === 'off' ? '可能未啟用，請到遊戲設定開啟 Log' : state.auto.detail === 'on' ? '已偵測' : '尚待確認'}`;
    if (!$('log-path').value && state.settings.logPath) $('log-path').value = state.settings.logPath;
  }
  $('capture-status').textContent = state.capture.message;
  $('capture-status').dataset.tone = state.capture.status === 'success' ? 'success' : state.capture.status === 'error' ? 'error' : '';
  $('test-capture').disabled = state.capture.status === 'busy';
  const capture = state.capture.last;
  if (capture && capture.id !== lastPreview) {
    lastPreview = capture.id;
    api.getPreview(capture.id).then(r=>{if(r.ok&&lastPreview===capture.id){$('preview').src=r.value;$('capture-preview').hidden=false;}}).catch(()=>notice('截圖預覽載入失敗。','error'));
    $('capture-detail').textContent = `${capture.sourceTitle} · ${capture.width} × ${capture.height} · ${new Date(capture.capturedAt).toLocaleString('zh-TW')} · 已保留最新截圖`;
  }
}
$('opacity').oninput = () => { opacityText(); dirty(); };
['always-on-top', 'show-on-startup', 'target-window'].forEach(id => $(id).onchange = dirty);
['analysis-mode','auto-consent'].forEach(id => $(id).onchange = dirty);
for (const [id, method] of [['find-log','findLog'],['choose-log','chooseLog']]) $(id).onclick = async () => {
  $(id).disabled = true;
  try { const r = await api[method](); if (!r.ok) throw new Error(r.error); if (r.value) { $('log-path').value = r.value; dirty(); notice('已選擇 Log，請儲存並套用。'); } else notice('尚未找到 Log，請手動選擇或啟動遊戲後再試。'); }
  catch (e) { notice(e.message,'error'); } finally { $(id).disabled = false; }
};
$('refresh-windows').onclick = refreshWindows;
$('capture-shortcut').oninput = dirty;
$('default-shortcut').onclick = () => { $('capture-shortcut').value = 'F9'; dirty(); };
$('reset-position').onclick = async () => {
  const result = await api.resetPosition(); notice(result.ok ? '已將小浮層移回主螢幕右上方。' : result.error, result.ok ? 'success' : 'error');
};
$('show-overlay').onclick = async () => { const result = await api.showOverlay(); if (!result.ok) notice(result.error, 'error'); };
$('test-capture').onclick = async () => {
  $('test-capture').disabled = true;
  try { const response = await api.testCapture(selectedTarget()); if (!response.ok) notice(response.error, 'error'); }
  catch { notice('無法開始截圖，請重試。', 'error'); }
  finally { $('test-capture').disabled = false; }
};
$('preferences').onsubmit = async event => {
  event.preventDefault(); if (saving) return;
  saving = true; $('save').disabled = true;
  try {
    const response = await api.saveSettings({ opacity: Number($('opacity').value) / 100, alwaysOnTop: $('always-on-top').checked,
      showOnStartup: $('show-on-startup').checked, captureShortcut: $('capture-shortcut').value, targetWindow: selectedTarget(),
      analysisMode:$('analysis-mode').value, autoConsent:$('auto-consent').checked, logPath:$('log-path').value });
    if (!response.ok) throw new Error(response.error);
    const selected = selectedTarget(); hydrate(response.value.settings); setTargetOptions([], selected); await refreshWindows();
    notice('設定已儲存並套用，重新啟動後會自動載入。', 'success');
  } catch (error) { notice(error.message || '設定儲存失敗。', 'error'); }
  finally { saving = false; $('save').disabled = false; }
};
api.onState(render);
function renderDiagnostics(d) {
  const time=value=>value?new Date(value).toLocaleTimeString('zh-TW'):'尚無';
  const jobs={Idle:'等待遊戲',Monitoring:'監控中',EventDetected:'偵測到事件',Capturing:'截圖中',Analyzing:'辨識中',Completed:'完成',Error:'錯誤'};
  const events={board:'盤面變更',skip:'新一天切換',objective:'目標選擇',instruments:'刑具選擇',treasure:'寶藏',speed:'加速切換'};
  $('diagnostic-work').textContent=`目前工作：${jobs[d.jobState]||d.jobState}\n最後讀取 Log：${time(d.lastLogRead)}｜最後事件：${events[d.lastEvent?.kind]||'尚無'} ${time(d.lastEvent?.at)}\n最後截圖：${time(d.lastCapture)}｜最後辨識：${time(d.lastAnalysis)}｜辨識耗時：${d.lastAnalysisMs==null?'尚無':Math.round(d.lastAnalysisMs)+' ms'}\n最近錯誤：${d.lastError?.message||'無'}\n主程序延遲 P99：${d.metrics.mainLagP99Ms||0} ms｜記憶體：${d.metrics.rssMB||0} MB｜Worker 建立：${d.metrics.workerStarts||0}\n建議走法：${({ready:'已完成',blocked:'需要修正盤面',error:'計算失敗'}[d.strategy?.status])||'尚無'}｜耗時：${d.strategy?.elapsedMs==null?'尚無':Math.round(d.strategy.elapsedMs)+' ms'}｜策略 Worker：${d.metrics.strategyWorkerStarts||0}\n畫面補充檢查：${d.visualWatch||'尚未啟動'}\n完整診斷檔：${d.file}`;
  $('diagnostic-log').textContent=d.recent.slice(-3).map(row=>`${time(row.at)} ${row.stage}${row.durationMs!=null?' '+Math.round(row.durationMs)+' ms':''}${row.error?' '+row.error:''}`).join('\n');
}
api.onDiagnostics(renderDiagnostics);api.getDiagnostics().then(r=>{if(r.ok)renderDiagnostics(r.value);});
$('copy-diagnostics').onclick=async()=>{const r=await api.copyDiagnostics();notice(r.ok?'診斷資訊已複製。':r.error,r.ok?'success':'error');};
api.getState().then(response => { if (response.ok) render(response.value); else notice(response.error, 'error'); }).catch(() => notice('無法讀取設定，請重新開啟設定視窗。', 'error'));

document.querySelectorAll("[data-credit]").forEach(button => { button.onclick = async () => { const r = await api.openCredit(button.dataset.credit); if (!r.ok) notice(r.error, "error"); }; });

'use strict';
const api = window.overlayApp;
const $ = id => document.getElementById(id);
function render(state) {
  window.renderAdvice(state);
  const target = state.settings.targetWindow;
  $('target').textContent = target ? `遊戲視窗：${target.title}` : '尚未選擇遊戲視窗，請先開啟設定';
  $('target').title = target?.title || '';
  $('capture-status').textContent = state.analysis.message;
  $('capture-status').dataset.status = state.analysis.status;
  $('auto-status').textContent = state.auto?.message || '等待遊戲';
  $('capture').disabled = state.analysis.status === 'busy' || state.capture.status === 'busy';
  $('shortcut').textContent = `${state.settings.captureShortcut.replace('Control', 'Ctrl')} 截圖`;
  $('warning').hidden = !state.shortcutWarning;
  $('warning').textContent = state.shortcutWarning;
}
async function action(fn) {
  try { const response = await fn(); if (!response.ok) throw new Error(response.error); }
  catch (error) { $('capture-status').textContent = error.message || '操作失敗，請重試。'; $('capture-status').dataset.status = 'error'; }
}
$('settings').onclick = () => action(() => api.openSettings());
$('hide').onclick = () => action(() => api.hideOverlay());
$('capture').onclick = () => {
  $('capture-status').textContent='正在截圖';$('capture-status').dataset.status='busy';$('capture').disabled=true;
  return action(() => api.analyzeCapture()).finally(()=>api.getState().then(r=>{if(r.ok)render(r.value);}));
};
$('board').onclick = () => action(() => api.openBoard());
$('fold').onclick = () => {
  const folded = $('card').classList.toggle('folded');
  $('fold').textContent = folded ? '＋' : '－';
  $('fold').title = folded ? '展開浮層' : '收合浮層';
  $('fold').setAttribute('aria-label', $('fold').title);
};
api.onState(render);
api.getState().then(result => { if (result.ok) render(result.value); }).catch(() => { $('capture-status').textContent = '無法讀取程式狀態。'; });
new ResizeObserver(() => api.resize($('card').getBoundingClientRect().height)).observe($('card'));

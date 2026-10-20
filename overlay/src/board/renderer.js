'use strict';
const api = window.overlayApp, $ = id => document.getElementById(id), L = window.labels, B = window.TartarusBoard;
let doc = null, selected = 1, saving = false, request = 0;
let previewId=null;
let advice=null;
function highlightAdvice(){
  const a=advice?.status==='ready'&&advice.revision===doc?.revision?advice.action:null;
  const cell=a?((a.type==='patrol')?a.cell:((['devour','chain','hunt'].includes(a.type))?a.to:null)):null;
  document.querySelectorAll('.cell').forEach(el=>{el.classList.toggle('advised',Number(el.dataset.cell)===cell);});
}
function options(id, values) {
  for (const [value, label] of Object.entries(values)) { const o = document.createElement('option'); o.value = value; o.textContent = label; $(id).append(o); }
}
options('kind', L.kind); $('kind').querySelector('[value=office]').remove();
options('beast', L.beast); options('tier', L.tier.slice(0, 5)); options('event', L.event);
options('step', L.step); options('objective', L.objective); options('start-event', L.startEvent);
options('active-event',L.event);
for (let i=0;i<3;i++) options(`pick-${i}`, {'':'待確認／尚未設定',...L.tool});
options('warden-position', Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i, i === 0 ? '01 辦公室' : String(i + 1).padStart(2, '0')])));
for (const [id, text] of Object.entries(L.tool)) {
  const label = document.createElement('label'), input = document.createElement('input'), art = document.createElement('span');
  input.type = 'checkbox'; input.value = id; art.innerHTML = B.INSTRUMENTS[id] || '';
  label.append(input, art, document.createTextNode(text)); $('tools').append(label);
}
for (let i = 0; i < 16; i++) {
  const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.value = i;
  label.append(input, document.createTextNode(i === 0 ? '01 辦公室' : String(i + 1).padStart(2, '0'))); $('destinations').append(label);
}
function pending(key) { return doc?.checks.includes(key); }
function status(state) {
  advice=state.advice;window.renderAdvice(state,true);highlightAdvice();
  $('status').textContent = state.analysis.message + (state.analysis.hasBoard && state.analysis.status === 'error' ? '（仍顯示上次盤面）' : '');
  $('capture').disabled = state.analysis.status === 'busy';
  if (state.analysis.warning) $('notice').textContent = state.analysis.warning;
  if (state.capture.last) $('preview').dataset.captureId=state.capture.last.id;
  if(state.analysis.revision!==doc?.revision)refresh();
}
async function refresh() {
  const id = ++request;
  const response = await api.getBoard();
  if (id !== request || !response.ok || response.value?.revision === doc?.revision) return;
  doc = response.value; render();
}
function render() {
  $('empty').hidden = !!doc; $('workspace').hidden = !doc; $('details').hidden = !doc; $('export').disabled = !doc;
  document.querySelectorAll('.cell').forEach(el => el.remove());
  if (!doc) return;
  const m = doc.model;
  for (let n = 0; n < 16; n++) {
    const c = m.cells[n], button = document.createElement('button'); button.type = 'button'; button.className = 'cell'; button.dataset.cell = n;
    button.style.gridRow = B.RING[n][0]; button.style.gridColumn = B.RING[n][1];
    button.classList.toggle('pending', pending(`cell:${n}`)); button.classList.toggle('door', m.dest.includes(n)); button.classList.toggle('selected', n === selected);
    if (c.tier !== undefined) button.dataset.tier = c.tier;
    const num = document.createElement('span'); num.textContent = String(n + 1).padStart(2, '0'); button.append(num);
    if (['inmate','scouted'].includes(c.kind)) { const art = document.createElement('span'); art.innerHTML = B.PORTRAITS[c.beast]; button.append(art); }
    const name = document.createElement('span'); name.className = 'name'; name.textContent = ['inmate','scouted'].includes(c.kind) ? `${L.beast[c.beast]} · ${L.tier[c.tier]}` : `${L.kind[c.kind]}${c.tier !== undefined ? ` · ${L.tier[c.tier]}` : ''}`; button.append(name);
    if (m.warden === n) { const flag = document.createElement('span'); flag.className = 'flag'; flag.textContent = `⚑ 典獄長${pending('warden') ? '？' : ''}`; button.append(flag); }
    if (c.event || c.marked || c.ivory) { const mark = document.createElement('small'); mark.textContent = [c.event ? `! ${L.event[c.event]}` : '', c.marked ? '獵物' : '', c.ivory ? '象牙' : ''].filter(Boolean).join(' · '); button.append(mark); }
    if (pending(`cell:${n}`)) { const check = document.createElement('small'); check.className = 'pending-text'; check.textContent = '待確認'; button.append(check); }
    button.onclick = () => { selected = n; render(); }; $('board').append(button);
  }
  $('summary').textContent = `第 ${m.day}／${m.maxDays} 日${pending('day') ? '（待確認）' : ''} · 彩色 ${m.vault.length}${pending('vault') ? '（待確認）' : ''}`;
  editCell();
  highlightAdvice();
  $('warden-position').value = m.warden; $('day').value = m.day; $('max-days').value = m.maxDays; $('vault').value = m.vault.length;
  $('step').value = m.step; $('objective').value = m.objective; $('start-event').value = m.startEvent;
  $('active-event').value=m.step==='event'?(m.eventKind||'unknown'):'unknown';
  $('choice-kind').value=m.choice.kind;
  choiceFields();
  for (let i=0;i<3;i++) $(`pick-${i}`).value = m.choice.options[i] || '';
  $('rerolls').value = m.choice.rerolls || 0;
  document.querySelectorAll('#tools input').forEach(i => { i.checked = m.tools.includes(i.value); });
  document.querySelectorAll('#destinations input').forEach(i => { i.checked = m.dest.includes(Number(i.value)); });
  $('checks').replaceChildren();
  for (const key of doc.checks) { const li = document.createElement('li'); li.textContent = key.startsWith('cell:') ? `第 ${Number(key.slice(5)) + 1} 格待確認` : `${L.check[key]}待確認`; $('checks').append(li); }
  if (!doc.checks.length) { const li = document.createElement('li'); li.textContent = '全部項目已確認'; $('checks').append(li); }
}
function editCell() {
  const c = doc.model.cells[selected]; $('cell-title').textContent = `第 ${String(selected + 1).padStart(2, '0')} 格修正`;
  if (selected === 0 && !$('kind').querySelector('[value=office]')) options('kind', { office: L.kind.office });
  if (selected !== 0) $('kind').querySelector('[value=office]')?.remove();
  $('kind').value = c.kind; $('beast').value = c.beast || 'mammoth'; $('tier').value = c.tier || 0; $('event').value = c.event || '';
  $('due').value = c.due || doc.model.day + 2; $('ivory').checked = !!c.ivory; $('marked').checked = !!c.marked;
  $('warden').checked = doc.model.warden === selected; $('dest').checked = doc.model.dest.includes(selected); cellFields();
}
function cellFields() {
  const kind = $('kind').value;
  $('kind').disabled = selected === 0;
  $('beast').disabled = !['inmate','scouted'].includes(kind); $('tier').disabled = !['inmate','scouted','revealed','scratch'].includes(kind);
  $('event').disabled = ['office','empty','nest'].includes(kind); $('due').disabled = kind !== 'nest';
  $('ivory').disabled = kind !== 'inmate'; $('marked').disabled = kind !== 'inmate';
}
$('kind').onchange = cellFields;
function choiceFields(){
  $('choice-controls').hidden=$('step').value!=='choice';
  $('pick-fields').hidden=$('step').value!=='choice'||$('choice-kind').value!=='tool';
  $('active-event-label').hidden=$('step').value!=='event';
}
$('step').onchange=choiceFields;$('choice-kind').onchange=choiceFields;
$('recommend').onclick=()=>api.recommend().then(r=>{if(!r.ok)$('notice').textContent=r.error;}).catch(e=>{$('notice').textContent=e.message;});
async function save(model, confirmed) {
  if (saving) return; saving = true; $('apply').disabled = true;
  try {
    const result = await api.editBoard({ revision: doc.revision, model, confirmed });
    if (!result.ok) throw new Error(result.error);
    doc = result.value; $('notice').textContent = '修正已儲存。'; render();
  } catch (error) { $('notice').textContent = error.message; await refresh(); }
  finally { saving = false; $('apply').disabled = false; }
}
$('cell-form').onsubmit = event => {
  event.preventDefault(); if (!doc) return;
  const m = structuredClone(doc.model), kind = selected === 0 ? 'office' : $('kind').value;
  const old = m.cells[selected]; const c = old.kind === kind ? { ...old } : { kind };
  if (['inmate','scouted'].includes(kind)) c.beast = $('beast').value;
  if (['inmate','scouted','revealed','scratch'].includes(kind)) c.tier = Number($('tier').value);
  if (!['empty','office','nest'].includes(kind)) c.event = $('event').value || null;
  if (kind === 'nest') c.due = Number($('due').value);
  if (kind === 'inmate') { c.ivory = $('ivory').checked; c.marked = $('marked').checked; }
  m.cells[selected] = c;
  const confirmed = [`cell:${selected}`];
  if ($('warden').checked) { m.warden = selected; confirmed.push('warden'); }
  else if (m.warden === selected) { $('notice').textContent = '請在新位置勾選典獄長，或使用下方位置選單。'; return; }
  m.dest = [...new Set([...m.dest.filter(n => n !== selected), ...($('dest').checked ? [selected] : [])])];
  save(m, confirmed);
};
$('meta-form').onsubmit = event => {
  event.preventDefault(); const m = structuredClone(doc.model);
  m.warden = Number($('warden-position').value); m.day = Number($('day').value); m.maxDays = Number($('max-days').value);
  const count = Number($('vault').value); m.vault = Array.from({ length: count }, (_, i) => m.vault[i] || 'wolf');
  m.step = $('step').value; m.objective = $('objective').value; m.startEvent = $('start-event').value;
  m.eventKind=$('active-event').value;
  if(m.step==='event'&&(!m.eventKind||m.eventKind==='unknown')){$('notice').textContent='請先確認目前事件種類。';return;}
  m.choice.kind=$('choice-kind').value;
  m.tools = [...document.querySelectorAll('#tools input:checked')].map(i => i.value); m.toolsLocked = true; m.toolsSeen = m.tools.length; m.toolsToConfirm = '';
  m.dest = [...document.querySelectorAll('#destinations input:checked')].map(i => Number(i.value));
  const confirmed = ['warden','day','vault','tools','dest', ...(m.objective !== 'other' ? ['objective'] : [])];
  if (m.step === 'choice' && m.choice.kind === 'tool') {
    const picks = Array.from({length:3},(_,i)=>$(`pick-${i}`).value);
    if (picks.every(Boolean) && new Set(picks).size === 3) { m.choice.options = picks; m.choice.rerolls = Number($('rerolls').value); confirmed.push('choice'); }
    else { $('notice').textContent = '請確認三張不同的刑具選擇卡。'; return; }
  }
  if(m.step==='choice'&&m.choice.kind==='gift'){m.choice.options=['ring','horn','wine','brand'];m.choice.rerolls=0;confirmed.push('choice');}
  save(m, confirmed);
};
async function action(fn) { try { const r = await fn(); if (!r.ok) throw new Error(r.error); await refresh(); } catch (e) { $('notice').textContent = e.message; } }
$('capture').onclick = () => {$('status').textContent='正在截圖';$('capture').disabled=true;return action(() => api.analyzeCapture());};
document.querySelector('details:has(#preview)').ontoggle=async event=>{
  const id=$('preview').dataset.captureId;
  if(event.target.open&&id&&id!==previewId){const r=await api.getPreview(id);if(r.ok){previewId=id;$('preview').src=r.value;}}
};
$('reload').onclick = () => action(() => api.reloadBoard());
$('import').onclick = () => action(() => api.importBoard());
$('export').onclick = () => action(() => api.exportBoard());
api.onState(status); api.getState().then(r => { if (r.ok) status(r.value); });

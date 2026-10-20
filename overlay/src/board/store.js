'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const T = require('../../vendor/coffeebns/js/engine');
const M = require('../../vendor/coffeebns/model-core.cjs');
const SOURCE = '12b85db88cc8a3ba9c63a7d52be7b9ddb0c888fd';
const allChecks = () => [...Array.from({ length: 15 }, (_, i) => `cell:${i + 1}`), 'warden', 'dest', 'tools', 'day', 'vault', 'objective'];
function validateModel(input) {
  if (!input || !Array.isArray(input.cells) || input.cells.length !== 16) throw new Error('盤面必須包含 16 格。');
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  for (const [n, c] of input.cells.entries()) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || !(n === 0 ? ['office'] : ['sealed','empty','inmate','scouted','scratch','revealed','nest']).includes(c.kind)) throw new Error(`第 ${n + 1} 格狀態不正確。`);
    if (['inmate','scouted'].includes(c.kind) && !T.BEASTS.includes(c.beast)) throw new Error('動物種類不正確。');
    if (['inmate','scouted','scratch','revealed'].includes(c.kind) && !integer(c.tier, 0, 4)) throw new Error('品質必須介於普通與至臻。');
    if (c.event != null && c.event !== 'unknown' && !T.EVENTS[c.event]) throw new Error('事件種類不正確。');
    if (c.prey && (!integer(c.prey.cell, 1, 15) || !integer(c.prey.rounds, 1, 9))) throw new Error('獵物標記不正確。');
    if (c.kind === 'nest' && !integer(c.due, 1, 99)) throw new Error('老鼠窩日期不正確。');
  }
  for (const [key, min, max] of [['warden',0,15],['day',1,60],['maxDays',5,60]]) if (input[key] !== undefined && !integer(input[key], min, max)) throw new Error('盤面位置或日期不正確。');
  if (input.dest !== undefined && (!Array.isArray(input.dest) || input.dest.length > 16 || input.dest.some(n => !integer(n, 0, 15)))) throw new Error('移動位置不正確。');
  if (input.tools !== undefined && (!Array.isArray(input.tools) || input.tools.some(id => !T.TOOL_IDS.includes(id)))) throw new Error('刑具資料不正確。');
  if (input.vault !== undefined && (!Array.isArray(input.vault) || input.vault.length > 10 || input.vault.some(b => !T.BEASTS.includes(b)))) throw new Error('彩色囚犯資料不正確。');
  if (input.choice && (!['tool','gift'].includes(input.choice.kind) || !Array.isArray(input.choice.options) || input.choice.options.length > 40 || input.choice.options.some(id => !(input.choice.kind === 'gift' ? T.GIFT_IDS : T.TOOL_IDS).includes(id)))) throw new Error('選項資料不正確。');
  if(input.eventKind!=null&&input.eventKind!=='unknown'&&!T.EVENTS[input.eventKind])throw new Error('目前事件種類不正確。');
  if(input.step==='event'&&input.eventKind==null)input={...input,eventKind:'unknown'};
  return M.normalize(input);
}
function validateDocument(input) {
  const text = JSON.stringify(input);
  if (!text || Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('盤面檔案過大。');
  const doc = JSON.parse(text);
  const model = validateModel(doc.model || doc);
  const validCheck = s => typeof s === 'string' && /^(cell:(?:[0-9]|1[0-5])|warden|dest|tools|day|vault|objective|choice)$/.test(s);
  const checks = Array.isArray(doc.checks) ? doc.checks : allChecks();
  if (checks.some(s => !validCheck(s))) throw new Error('待確認項目格式不正確。');
  const pending = new Set(checks);
  if (model.step === 'choice' && !doc.choiceConfirmed) pending.add('choice');
  model.cells.forEach((c, n) => { if (c.event === 'unknown') pending.add(`cell:${n}`); });
  return { ...(doc.model ? doc : {}), format: 'tartarus-overlay-board', version: 1, upstream: SOURCE, model, checks: [...pending] };
}
class BoardStore {
  constructor(file) { this.file = file; this.document = null; this.warning = ''; this.load(); }
  get() { return this.document ? structuredClone(this.document) : null; }
  summary() { const d=this.document;return {revision:d?.revision||null,pending:d?.checks.length||0,hasBoard:!!d}; }
  view() { if(!this.document)return null;const {raw,notes,...view}=this.document;return structuredClone(view); }
  load() {
    if (!fs.existsSync(this.file)) { this.document = null; return null; }
    try {
      if (fs.statSync(this.file).size > 8 * 1024 * 1024) throw new Error('檔案過大');
      this.document = validateDocument(JSON.parse(fs.readFileSync(this.file, 'utf8')));
      // Older/upstream documents have no revision. Give each loaded snapshot an identity.
      if(!this.document.revision)this.document.revision=randomUUID();
      this.warning = '';
    } catch { this.warning = '最近盤面無法載入，原始檔仍保留。請匯入有效盤面或重新截圖。'; }
    return this.get();
  }
  save(input) {
    const doc = validateDocument(input);
    doc.revision = randomUUID(); doc.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(doc, null, 2)); fs.renameSync(`${this.file}.tmp`, this.file);
    this.document = doc; this.warning = ''; return this.get();
  }
  edit({ revision, model, confirmed = [] }) {
    if (!this.document || revision !== this.document.revision) throw new Error('盤面已更新，請使用最新盤面再修正。');
    const remaining = this.document.checks.filter(key => !confirmed.includes(key));
    return this.save({ ...this.document, model, checks: remaining, choiceConfirmed:confirmed.includes('choice') || this.document.choiceConfirmed, manuallyEdited: true });
  }
}
module.exports = { BoardStore, validateModel, validateDocument, allChecks };

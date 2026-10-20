'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { normalizeShortcut } = require('../shared/shortcut');
const DEFAULTS = Object.freeze({ schemaVersion: 1, opacity: 1, alwaysOnTop: true, showOnStartup: true, captureShortcut: 'F9', targetWindow: null, position: null, analysisMode: 'auto', autoConsent: false, logPath: '' });
const clone = value => JSON.parse(JSON.stringify(value));
function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('設定格式不正確。');
  const out = { schemaVersion: 1 };
  if (typeof input.opacity !== 'number' || !Number.isFinite(input.opacity) || input.opacity < 0.3 || input.opacity > 1) throw new Error('不透明度必須介於 30% 到 100%。');
  out.opacity = Math.round(input.opacity * 100) / 100;
  for (const key of ['alwaysOnTop', 'showOnStartup']) {
    if (typeof input[key] !== 'boolean') throw new Error('開關設定格式不正確。');
    out[key] = input[key];
  }
  out.captureShortcut = normalizeShortcut(input.captureShortcut);
  out.analysisMode = input.analysisMode ?? 'auto';
  out.autoConsent = input.autoConsent ?? false;
  out.logPath = input.logPath ?? '';
  if (!['auto','manual'].includes(out.analysisMode) || typeof out.autoConsent !== 'boolean' || typeof out.logPath !== 'string' || out.logPath.length > 4096 || (out.logPath && (!path.isAbsolute(out.logPath) || !/^UE_game(?:_\d+)?\.log$/i.test(path.basename(out.logPath))))) throw new Error('分析模式或 Log 路徑不正確。請選擇 UE_game.log。');
  if (input.targetWindow !== null) {
    const target = input.targetWindow;
    if (!target || typeof target.id !== 'string' || !/^window:\d+:\d+$/.test(target.id) || typeof target.title !== 'string' || !target.title.trim() || target.title.length > 512) throw new Error('請選擇有效的遊戲視窗。');
    out.targetWindow = { id: target.id, title: target.title.trim() };
  } else out.targetWindow = null;
  if (input.position !== null) {
    const p = input.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) throw new Error('浮層位置不正確。');
    out.position = { x: Math.round(p.x), y: Math.round(p.y) };
  } else out.position = null;
  return out;
}
class SettingsStore {
  constructor(file) {
    this.file = file; this.warning = ''; this.value = clone(DEFAULTS);
    if (!fs.existsSync(file)) return;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      this.value = saved.schemaVersion === 1 ? validateSettings(saved) : validateSettings({ ...DEFAULTS, position: saved.overlay || null });
    } catch {
      this.warning = '原設定檔無法讀取，目前使用預設設定；原檔已保留備份。';
      try { fs.copyFileSync(file, `${file}.unreadable-backup`); }
      catch { this.warning = '原設定檔無法讀取，目前使用預設設定。'; }
    }
  }
  get() { return clone(this.value); }
  validate(patch) { return validateSettings({ ...this.value, ...patch }); }
  update(patch) {
    const next = this.validate(patch); const temp = `${this.file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temp, this.file);
    } catch {
      try { fs.unlinkSync(temp); } catch {}
      throw new Error('設定儲存失敗，請確認資料夾可供讀寫。');
    }
    this.value = next; this.warning = '';
    return this.get();
  }
}
module.exports = { SettingsStore, DEFAULTS, validateSettings };

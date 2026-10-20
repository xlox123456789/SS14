'use strict';
const { BrowserWindow } = require('electron');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { visiblePosition } = require('../shared/position');
const { localWindow } = require('../shared/window-security');
class OverlayController extends EventEmitter {
  constructor({ icon, settings, screen }) {
    super(); this.icon = icon; this.settings = settings; this.screen = screen;
    this.window = null; this.positionTimer = null; this.disposing = false;
  }
  create() {
    this.window = new BrowserWindow({
      width: 360, height: 190, show: false, frame: false, transparent: true,
      resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
      alwaysOnTop: this.settings.alwaysOnTop, skipTaskbar: true, focusable: false, hasShadow: false,
      title: 'SS14小浮層', icon: this.icon,
      webPreferences: { preload: path.join(__dirname, '../shared/preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    localWindow(this.window);
    this.window.setContentProtection(false);
    this.applySettings(this.settings); this.place(this.settings.position);
    this.window.on('move', () => { clearTimeout(this.positionTimer); this.positionTimer = setTimeout(() => this.flushPosition(), 200); });
    this.window.on('close', event => { if (!this.disposing) { event.preventDefault(); this.hide(); } });
    this.window.webContents.on('did-finish-load', () => this.emit('ready'));
    this.window.loadFile(path.join(__dirname, 'index.html'));
    return this.window;
  }
  applySettings(settings) {
    this.settings = settings;
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setOpacity(settings.opacity);
    this.window.setAlwaysOnTop(settings.alwaysOnTop, settings.alwaysOnTop ? 'screen-saver' : 'normal');
  }
  place(saved) {
    const { width, height } = this.window.getBounds();
    const position = visiblePosition({ saved, width, height, primary: this.screen.getPrimaryDisplay().workArea, areas: this.screen.getAllDisplays().map(d => d.workArea) });
    this.window.setPosition(position.x, position.y); return position;
  }
  resetPosition() { const position = this.place(null); this.settings.position = position; return position; }
  ensureOnScreen() { if (this.window && !this.window.isDestroyed()) this.place(this.window.getBounds()); }
  show() { if (this.window && !this.window.isDestroyed()) { this.ensureOnScreen(); this.window.showInactive(); this.applySettings(this.settings); } }
  hide() { if (this.window && !this.window.isDestroyed()) this.window.hide(); }
  isVisible() { return !!this.window && !this.window.isDestroyed() && this.window.isVisible(); }
  resize(value) {
    if (!Number.isFinite(value) || !this.window || this.window.isDestroyed()) return;
    const maxHeight = Math.min(500, this.screen.getDisplayMatching(this.window.getBounds()).workArea.height);
    const height = Math.max(44, Math.min(maxHeight, Math.ceil(value)));
    if (this.window.getBounds().height !== height) {
      const { x, y } = this.window.getBounds();
      this.window.setBounds({ x, y, width: 360, height });
      this.ensureOnScreen();
    }
  }
  flushPosition() {
    clearTimeout(this.positionTimer);
    if (!this.window || this.window.isDestroyed()) return;
    const { x, y } = this.window.getBounds(); this.settings.position = { x, y };
    this.emit('position', { x, y });
  }
  publish(snapshot) { if (this.isVisible()) this.window.webContents.send('app:state-changed', snapshot); }
  dispose() { this.disposing = true; clearTimeout(this.positionTimer); }
}
module.exports = { OverlayController };
